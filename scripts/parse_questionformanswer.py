# Mostly copy-pasted from Boto.


# Copyright (c) 2006,2007 Mitch Garnaat http://garnaat.org/
#
# Permission is hereby granted, free of charge, to any person obtaining a
# copy of this software and associated documentation files (the
# "Software"), to deal in the Software without restriction, including
# without limitation the rights to use, copy, modify, merge, publish, dis-
# tribute, sublicense, and/or sell copies of the Software, and to permit
# persons to whom the Software is furnished to do so, subject to the fol-
# lowing conditions:
#
# The above copyright notice and this permission notice shall be included
# in all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
# OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABIL-
# ITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
# SHALL THE AUTHOR BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
# WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
# IN THE SOFTWARE.

import xml.sax
from io import StringIO

def parse_qfa(body):
    rs = ResultSet([('Answer', QuestionFormAnswer)])
    h = XmlHandler(rs, None)
    xml.sax.parseString(body, h)
    return [(answer.qid, answer.fields[0]) for answer in rs]



class XmlHandler(xml.sax.ContentHandler):

    def __init__(self, root_node, connection):
        self.connection = connection
        self.nodes = [('root', root_node)]
        self.current_text = ''

    def startElement(self, name, attrs):
        self.current_text = ''
        new_node = self.nodes[-1][1].startElement(name, attrs, self.connection)
        if new_node is not None:
            self.nodes.append((name, new_node))

    def endElement(self, name):
        self.nodes[-1][1].endElement(name, self.current_text, self.connection)
        if self.nodes[-1][0] == name:
            if hasattr(self.nodes[-1][1], 'endNode'):
                self.nodes[-1][1].endNode(self.connection)
            self.nodes.pop()
        self.current_text = ''

    def characters(self, content):
        self.current_text += content


class XmlHandlerWrapper(object):
    def __init__(self, root_node, connection):
        self.handler = XmlHandler(root_node, connection)
        self.parser = xml.sax.make_parser()
        self.parser.setContentHandler(self.handler)
        self.parser.setFeature(xml.sax.handler.feature_external_ges, 0)

    def parseString(self, content):
        return self.parser.parse(StringIO(content))


class MTurkRequestError:
    def __init__(self, status, reason, body):
        self.status = status
        self.reason = reason
        self.body = body

    def __repr__(self):
        return f'MTurkRequestError({self.status!r}, {self.reason!r}, {self.body!r})'



class BaseAutoResultElement(object):
    """
    Base class to automatically add attributes when parsing XML
    """
    def __init__(self, connection):
        pass

    def startElement(self, name, attrs, connection):
        return None

    def endElement(self, name, value, connection):
        setattr(self, name, value)


class Assignment(BaseAutoResultElement):
    """
    Class to extract an Assignment structure from a response (used in
    ResultSet)

    Will have attributes named as per the Developer Guide,
    e.g. AssignmentId, WorkerId, HITId, Answer, etc
    """

    def __init__(self, connection):
        super(Assignment, self).__init__(connection)
        self.answers = []

    def endElement(self, name, value, connection):
        # the answer consists of embedded XML, so it needs to be parsed independantly
        if name == 'Answer':
            answer_rs = ResultSet([('Answer', QuestionFormAnswer)])
            h = XmlHandler(answer_rs, connection)
            # value = connection.get_utf8_value(value)
            xml.sax.parseString(value, h)
            self.answers.append(answer_rs)
        else:
            super(Assignment, self).endElement(name, value, connection)


class QuestionFormAnswer(BaseAutoResultElement):
    """
    Class to extract Answers from inside the embedded XML
    QuestionFormAnswers element inside the Answer element which is
    part of the Assignment and QualificationRequest structures

    A QuestionFormAnswers element contains an Answer element for each
    question in the HIT or Qualification test for which the Worker
    provided an answer. Each Answer contains a QuestionIdentifier
    element whose value corresponds to the QuestionIdentifier of a
    Question in the QuestionForm. See the QuestionForm data structure
    for more information about questions and answer specifications.

    If the question expects a free-text answer, the Answer element
    contains a FreeText element. This element contains the Worker's
    answer

    *NOTE* - currently really only supports free-text and selection answers
    """

    def __init__(self, connection):
        super(QuestionFormAnswer, self).__init__(connection)
        self.fields = []
        self.qid = None

    def endElement(self, name, value, connection):
        if name == 'QuestionIdentifier':
            self.qid = value
        elif name in ['FreeText', 'SelectionIdentifier', 'OtherSelectionText'] and self.qid:
            self.fields.append(value)




class ResultSet(list):
    """
    The ResultSet is used to pass results back from the Amazon services
    to the client. It is light wrapper around Python's :py:class:`list` class,
    with some additional methods for parsing XML results from AWS.
    Because I don't really want any dependencies on external libraries,
    I'm using the standard SAX parser that comes with Python. The good news is
    that it's quite fast and efficient but it makes some things rather
    difficult.

    You can pass in, as the marker_elem parameter, a list of tuples.
    Each tuple contains a string as the first element which represents
    the XML element that the resultset needs to be on the lookout for
    and a Python class as the second element of the tuple. Each time the
    specified element is found in the XML, a new instance of the class
    will be created and popped onto the stack.

    :ivar str next_token: A hash used to assist in paging through very long
        result sets. In most cases, passing this value to certain methods
        will give you another 'page' of results.
    """
    def __init__(self, marker_elem=None):
        list.__init__(self)
        if isinstance(marker_elem, list):
            self.markers = marker_elem
        else:
            self.markers = []
        self.marker = None
        self.key_marker = None
        self.next_marker = None  # avail when delimiter used
        self.next_key_marker = None
        self.next_upload_id_marker = None
        self.next_version_id_marker = None
        self.next_generation_marker = None
        self.version_id_marker = None
        self.is_truncated = False
        self.next_token = None
        self.status = True

    def startElement(self, name, attrs, connection):
        for t in self.markers:
            if name == t[0]:
                obj = t[1](connection)
                self.append(obj)
                return obj
        return None

    def to_boolean(self, value, true_value='true'):
        if value == true_value:
            return True
        else:
            return False

    def endElement(self, name, value, connection):
        if name == 'IsTruncated':
            self.is_truncated = self.to_boolean(value)
        elif name == 'Marker':
            self.marker = value
        elif name == 'KeyMarker':
            self.key_marker = value
        elif name == 'NextMarker':
            self.next_marker = value
        elif name == 'NextKeyMarker':
            self.next_key_marker = value
        elif name == 'VersionIdMarker':
            self.version_id_marker = value
        elif name == 'NextVersionIdMarker':
            self.next_version_id_marker = value
        elif name == 'NextGenerationMarker':
            self.next_generation_marker = value
        elif name == 'UploadIdMarker':
            self.upload_id_marker = value
        elif name == 'NextUploadIdMarker':
            self.next_upload_id_marker = value
        elif name == 'Bucket':
            self.bucket = value
        elif name == 'MaxUploads':
            self.max_uploads = int(value)
        elif name == 'MaxItems':
            self.max_items = int(value)
        elif name == 'Prefix':
            self.prefix = value
        elif name == 'return':
            self.status = self.to_boolean(value)
        elif name == 'StatusCode':
            self.status = self.to_boolean(value, 'Success')
        elif name == 'ItemName':
            self.append(value)
        elif name == 'NextToken':
            self.next_token = value
        elif name == 'nextToken':
            self.next_token = value
            # Code exists which expects nextToken to be available, so we
            # set it here to remain backwards-compatibile.
            self.nextToken = value
        elif name == 'BoxUsage':
            try:
                connection.box_usage += float(value)
            except:
                pass
        elif name == 'IsValid':
            self.status = self.to_boolean(value, 'True')
        else:
            setattr(self, name, value)

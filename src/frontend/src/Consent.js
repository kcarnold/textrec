import React from "react";

const Consent = ({ timeEstimate, platform }) => (
  <section
    className="container"
    style={{
      marginBottom: 15,
      padding: "10px 10px",
    }}
  >
    <p>Try out writing with a few different keyboard designs!</p>

    <hr />
    <p>
      <b>Eligibility</b>
      <br />
      Participants should have normal or corrected-to-normal vision and
      experience entering text on a touchscreen device.{" "}
      <b>You will need a smartphone with WiFi to complete this task.</b>{" "}
      Participants must be adults (at least 18 years old).
    </p>
    <p>
      Your phone will need to have a good connection with our server for this
      task.
    </p>

    <table
      cellPadding={0}
      cellSpacing={0}
      style={{
        marginLeft: "5.4pt",
        borderCollapse: "collapse",
        border: "none",
      }}
    >
      <tbody>
        <tr>
          <td
            style={{
              border: "solid black 1.5pt",
              borderBottom: "solid silver 1.5pt",
              padding: "0in 2.15pt 0in 2.9pt",
            }}
          >
            <p>
              <span style={{ fontSize: "14.0pt" }}>
                Study Title: Writing with Predictive Typing
              </span>
            </p>
          </td>
        </tr>
        <tr>
          <td
            style={{
              border: "solid black 1.5pt",
              borderTop: "none",
              padding: "0in 2.15pt 0in 2.9pt",
            }}
          >
            <p>
              <span style={{ fontSize: "14.0pt" }}>
                Researcher: Kenneth C. Arnold
              </span>
            </p>
          </td>
        </tr>
      </tbody>
    </table>
    <p>
      <b>
        <span style={{ fontSize: "14.0pt" }}>Participation is voluntary</span>
      </b>
    </p>
    <p>
      It is your choice whether or not to participate in this research.&nbsp; If
      you choose to participate, you may change your mind and leave the study at
      any time {platform === "turk" && "by returning the HIT"}. Refusal to
      participate or stopping your participation will involve no penalty or loss
      of benefits to which you are otherwise entitled. (Note that for technical
      reasons we can only provide payment for fully completed tasks.)
      Participants must be adults 18+.
    </p>
    <p>
      <b>
        <span style={{ fontSize: "14.0pt" }}>
          What is the purpose of this research?
        </span>
      </b>
    </p>
    <p>
      We are studying how different touchscreen keyboards affect the writing
      process, writing outcome, and the author’s subjective experience, and how
      psychological factors may influence those effects.
    </p>
    <p>
      <b>
        <span style={{ fontSize: "14.0pt" }}>
          What can I expect if I take part in this research? What is the time
          commitment?
        </span>
      </b>
    </p>
    <p>
      You will write using a few different keyboards. You should not include any
      personally identifiable information in what you write.
    </p>
    <p>
      Surveys in this study may include questions about your age, gender,
      personality, computer use, and other demographic information.
    </p>
    <p>
      We expect the time commitment to be about <strong>{timeEstimate}</strong>.
    </p>
    <p>
      <b>
        <span style={{ fontSize: "14.0pt" }}>
          What are the risks and possible discomforts?
        </span>
      </b>
    </p>
    <p>
      There are no anticipated risks beyond normal use of a computer or
      smartphone. Please take a break if you start to feel any discomfort from
      prolonged computer use.
    </p>
    <p>
      <b>
        <span style={{ fontSize: "14.0pt" }}>
          Are there any benefits from being in this research study?{" "}
        </span>
      </b>
    </p>
    <p>
      We cannot promise any benefits to you or others from your taking part in
      this research. The results of this research may inform future advances in
      computer systems that assist writing.
    </p>
    <p>
      <b>
        <span style={{ fontSize: "14.0pt" }}>
          Will I be compensated for participating in this research?
        </span>
      </b>
    </p>
    {platform ? (
      <p>
        Upon completion of the study, you will be paid the amount shown in the{" "}
        {platform === "sona" && "HDSL"} {platform === "turk" && "MTurk"} system.
        We determined this amount based on the estimated time to complete the
        task at a target rate of $9/hr.
      </p>
    ) : (
      <p>
        The payment for this study is $12/hr or $10, whichever is greater, paid
        in cash at the completion of the session.
      </p>
    )}

    <p>
      Your payment will in no way depend on how you use any unusual features of
      the keyboards being tested.
    </p>
    <p>
      <b>
        <span style={{ fontSize: "14.0pt" }}>
          If I take part in this research, how will my privacy be protected?
          What happens to the information you collect?
        </span>
      </b>
    </p>
    <p>
      We will not record any personally identifying information. De-identified
      data may be shared with other researchers and other participants in this
      study.
    </p>
    {platform === "turk" && (
      <p>
        The MTurk platform provides access to your worker ID, which in some
        cases can be mapped to your name and work history. We are relying on the
        security of that platform to maintain your confidentiality. To partially
        mitigate the risk of re-identification, we will assign you a random
        identifier specific to this study and delete the mapping between this
        identifier and your worker ID 6 months after the experiment concludes.
        But if the security of the MTurk platform or our account is breached, it
        may be possible to re-identify your work, as with any MTurk task.{" "}
        <b>Please make sure to mark your Amazon Profile as private</b> if you do
        not want it to be found from your Mechanical Turk Worker ID.
      </p>
    )}
    {platform === "sona" && (
      <p>
        The Sona platform used by HDSL provides access to your Sona ID, which in
        some cases can be mapped to your name and participation history. We are
        relying on the security of that platform to maintain your
        confidentiality. To partially mitigate the risk of re-identification, we
        will assign you a random identifier specific to this study and delete
        the mapping between this identifier and your Sona ID 6 months after the
        experiment concludes. But if the security of the Sona platform or our
        account is breached, it may be possible to re-identify your work, as
        with any HDSL study.
      </p>
    )}
    <p>
      <b>
        <span style={{ fontSize: "14.0pt" }}>
          If I have any questions, concerns or complaints about this research
          study, who can I talk to?
        </span>
      </b>
    </p>
    <p>
      If you have questions, concerns, or complaints, or think the research has
      hurt you, talk to the research team at kcarnold@seas.harvard.edu,
      617-299-6536, or 33 Oxford St MD 240, Cambridge MA 02138. The faculty
      sponsor is Krzysztof Z. Gajos who can be reached at
      kgajos@seas.harvard.edu. This research has been reviewed and approved by
      the Harvard University Area Institutional Review Board (“IRB”). You may
      talk to them at (617) 496-2847 or cuhs@harvard.edu if:
    </p>

    <ul style={{ marginTop: "0in" }} type="disc">
      <li>
        Your questions, concerns, or complaints are not being answered by the
        research team.
      </li>
      <li>You cannot reach the research team.</li>
      <li>You want to talk to someone besides the research team.</li>
      <li>You have questions about your rights as a research subject.</li>
      <li>You want to get information or provide input about this research.</li>
    </ul>
  </section>
);

export default Consent;

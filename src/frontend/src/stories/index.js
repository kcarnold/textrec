import React from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { linkTo } from '@storybook/addon-links';

import { Button, Welcome } from '@storybook/react/demo';

import Consent from '../Consent';

const maxWidth = (w, component) => <div style={{maxWidth: w, margin: '0 auto'}}>{component}</div>;

storiesOf('Welcome', module).add('to Storybook', () => <Welcome showApp={linkTo('Button')} />);

storiesOf('Button', module)
  .add('with text', () => <Button onClick={action('clicked')}>Hello Button</Button>)
  .add('with some emoji', () => (
    <Button onClick={action('clicked')}>
      <span role="img" aria-label="so cool">
        😀 😎 👍 💯
      </span>
    </Button>
  ));

  storiesOf('Consent', module)
  .add('default', () => maxWidth(500, <Consent timeEstimate="20-25 minutes" platform={null} />))
  .add('MTurk', () => maxWidth(500, <Consent timeEstimate="20-25 minutes" platform={'turk'} />))
  .add('HDSL', () => maxWidth(500, <Consent timeEstimate="20-25 minutes" platform={'sona'} />))
  ;
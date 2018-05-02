#!/bin/bash
cd "$(dirname ${BASH_SOURCE[0]})"
NODE_ENV=development npx babel-node --presets env,react-app get_all_stimuli.js

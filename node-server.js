#!/usr/bin/env node

/* eslint-env node */
/* eslint no-console: off, no-process-exit: off */

'use strict';

const baseUrl = 'https://www.reddit.com/api/v1/';
const request = require('request-promise').defaults({ json: true, baseUrl });
const port = 65010;
const expected_redirect_uri = `http://localhost:${port}/authorize_callback`;

// Request the list of scopes from reddit right as the program starts.
// Since the question about scope comes last, this promise is usually already resolved by the time that question is reached.
const scopePromise = request.get('scopes');
askQuestions().catch(console.error);

function askQuestions () {
  console.log(
    '\nWelcome to reddit-oauth-helper. This script will allow you to easily get an authentication token from ' +
    'reddit, which is necessary in order to access the reddit API. In most cases, you should only need to run it once; ' +
    'after you obtain a refresh token, you can use it indefinitely. If you already have a refresh token, you can skip ' +
    'this guide.\n\n---\n\nTo start, you will need to create an app on reddit by going to this page and scrolling down to ' +
    `the bottom: https://www.reddit.com/prefs/apps\n\nSet the app's redirect uri to: ${expected_redirect_uri}\n\nAfter ` +
    'you have created your app, please enter the following information:\n'
  );

  return require('inquirer').prompt([
    {
      type: 'list',
      name: 'app_type',
      message: 'Please select your app type.',
      choices: ['web app', 'installed app', 'personal use script'],
      default: 0,
    },
    {
      type: 'input',
      name: 'client_id',
      message: 'Client ID: ',
      validate: input => /^\s*[a-zA-Z0-9_-]+\s*$/.test(input) || 'Please enter your client ID. This is the string that appears to the right of your app\'s icon on this page: https://www.reddit.com/prefs/apps',
      filter: input => input.trim(),
    },
    {
      type: 'password',
      name: 'client_secret',
      message: 'Client secret: ',
      validate: input => /^\s*[a-zA-Z0-9_-]{30}\s*$/.test(input) || 'Please enter your client secret. This is the 30-character string that appears when you click "edit" next to your app on this page: https://www.reddit.com/prefs/apps',
      filter: input => input.trim(),
      when: responses => responses.app_type !== 'installed app',
    },
    {
      type: 'list',
      name: 'duration',
      message: 'Please select a duration for your token.',
      choices: ['Permanent (never expires)', 'Temporary (expires after 1 hour)'],
      default: 0,
      filter: choice => choice.startsWith('Temporary') ? 'temporary' : 'permanent',
    },
    {
      type: 'checkbox',
      name: 'scope',
      message: 'Please select the scope (i.e. the permissions on your reddit account) that you would like your token to have.',
      choices: () => scopePromise.then(scopes => Object.keys(scopes).sort().map(key => `${key}: ${scopes[key].description}`)),
      validate: input => !!input.length || 'Please select at least one scope. (Use spacebar to select, arrow keys to move up/down.)',
    },
  ]).then(openAuthenticationPage);
}

function getAuthenticationUrl (state, results) {
  return `${baseUrl}authorize?${require('querystring').stringify({
    client_id: results.client_id,
    response_type: 'code',
    state,
    redirect_uri: expected_redirect_uri,
    duration: results.duration,
    scope: results.scope.map(option => option.split(':')[0]).join(' '),
  })}`;
}

function openAuthenticationPage (results) {
  const state = require('crypto').randomBytes(16).toString('base64');
  const authenticationUrl = getAuthenticationUrl(state, results);
  require('open')(authenticationUrl);
  console.log(`\nHopefully your browser just opened. If it didn't, try going to this URL manually:\n\n${authenticationUrl}\n`);
  listenForCallback(state, results);
}

function handleError (res, err, state, results) {
  console.error(err);
  res.writeHead(500, { 'Content-Type': 'text/html' });
  if (err.statusCode) {
    res.write(`An unknown error occured (status code: ${err.statusCode}). Details on the error have been logged below. `);
  }
  res.write(`Depending on the type of error, <a href=${getAuthenticationUrl(state, results)}>trying again</a> might help.`);
  res.write(`<pre><code>${require('util').inspect(err)}</code></pre>`);
  res.end();
}

function listenForCallback (state, results) {
  require('http').createServer((req, res) => {
    const query = require('url').parse(req.url, true).query;
    if (query.state !== state) {
      res.writeHead(401);
      res.end();
    } else if (query.code) {
      request.post({
        uri: 'access_token',
        auth: { user: results.client_id, pass: results.client_secret || '' },
        form: { grant_type: 'authorization_code', code: query.code, redirect_uri: expected_redirect_uri },
      }).then(token_info => {
        console.log(token_info);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write('Your token was retrieved successfully. Thank you for using reddit-oauth-helper.');
        res.write(`<pre><code>${JSON.stringify(token_info, null, 4)}</code></pre>`);
        res.end();
        process.exit();
      }).catch(err => handleError(res, err, state, results));
    } else if (query.error === 'access_denied') {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.write('In order to obtain a token, you will need to click "allow" at the reddit authentication screen.');
      res.write(`<br><br>To try again, click <a href=${getAuthenticationUrl(state, results)}>here</a>.`);
      res.end();
    } else {
      handleError(res, { statusCode: 400, statusMessage: 'Failed to parse response from reddit' }, state, results);
    }
  }).listen(port);
}

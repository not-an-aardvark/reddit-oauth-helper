/* eslint-env browser */

'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

class RedditOauthHelper extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      anonymousSnoowrap: null,
      scopeList: null,
      clientIdInput: '',
      clientSecretInput: '',
      durationInputIsPermanent: false,
      userSnoowrap: null,
      displayedAccessToken: null
    };

    this.fetchAnonymousToken().then(anonymousSnoowrap => {
      return anonymousSnoowrap.getOauthScopeList().then(scopeResponse => {
        this.setState({
          scopeList: Object.keys(scopeResponse).sort().reduce((scopeList, scopeName) => {
            scopeList.push({ name: scopeName, description: scopeResponse[scopeName].description, selected: false });
            return scopeList;
          }, [])
        });
      });
    });
  }

  render() {
    return React.createElement(
      'div',
      null,
      React.createElement(
        'h1',
        null,
        'Reddit OAuth Helper ',
        React.createElement(ThemeSwitcher, null)
      ),
      React.createElement(
        'h4',
        null,
        'A tool to generate reddit OAuth tokens'
      ),
      React.createElement(AnonymousTokenDisplay, {
        anonymousToken: this.state.anonymousSnoowrap && this.state.anonymousSnoowrap.accessToken,
        generateNewToken: () => this.fetchAnonymousToken()
      }),
      React.createElement('hr', null),
      React.createElement(
        'div',
        null,
        React.createElement(
          'h3',
          null,
          'Generate Token'
        ),
        React.createElement(ClientInfoInput, {
          updateClientId: clientIdInput => this.setState({ clientIdInput: clientIdInput.trim() }),
          updateClientSecret: clientSecretInput => this.setState({ clientSecretInput: clientSecretInput.trim() }),
          toggleDuration: () => this.setState(state => ({ durationInputIsPermanent: !state.durationInputIsPermanent }))
        }),
        this.state.scopeList ? React.createElement(ScopeSelection, {
          scopeList: this.state.scopeList,
          onScopeSelectedChange: index => this.onScopeSelectedChange(index),
          onSelectAll: () => this.onSelectAll()
        }) : React.createElement(
          'div',
          null,
          'Loading scope selection...'
        ),
        React.createElement(GenerateButton, { disabled: !this.canSubmit(), generateTokens: () => this.generateTokens() })
      ),
      this.state.userSnoowrap && React.createElement(UserTokenDisplay, {
        refreshToken: this.state.userSnoowrap.refreshToken,
        accessToken: this.state.displayedAccessToken,
        revokeTokens: () => this.revokeTokens(),
        regenerateAccessToken: () => this.regenerateAccessToken()
      })
    );
  }

  fetchAnonymousToken() {
    const form = new FormData();
    form.set('grant_type', 'https://oauth.reddit.com/grants/installed_client');
    form.set('device_id', 'DO_NOT_TRACK_THIS_DEVICE');
    return fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'post',
      body: form,
      headers: { authorization: `Basic ${btoa(this.props.anonymousClientId + ':')}` },
      credentials: 'omit'
    }).then(response => response.text()).then(JSON.parse).then(tokenInfo => tokenInfo.access_token).then(anonymousToken => {
      const anonymousSnoowrap = new snoowrap({ accessToken: anonymousToken });
      anonymousSnoowrap.config({ proxies: false, requestDelay: 1000 });
      this.setState({ anonymousSnoowrap });
      return anonymousSnoowrap;
    });
  }

  onScopeSelectedChange(index) {
    this.setState(state => {
      const scopeListClone = state.scopeList.slice();

      scopeListClone[index] = _extends({}, state.scopeList[index], { selected: !state.scopeList[index].selected });

      return { scopeList: scopeListClone };
    });
  }

  onSelectAll() {
    this.setState(state => {
      const everythingAlreadySelected = state.scopeList.every(scope => scope.selected);
      return { scopeList: state.scopeList.map(scopeInfo => _extends({}, scopeInfo, { selected: !everythingAlreadySelected })) };
    });
  }

  canSubmit() {
    return this.state.clientIdInput && this.state.scopeList.some(scope => scope.selected);
  }

  generateTokens() {
    const state = btoa([...window.crypto.getRandomValues(new Uint8Array(32))].map(num => String.fromCharCode(num)).join(''));
    const clientId = this.state.clientIdInput;
    const clientSecret = this.state.clientSecretInput;
    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = snoowrap.getAuthUrl({
      clientId,
      clientSecret,
      scope: this.state.scopeList.filter(scopeInfo => scopeInfo.selected).map(scopeInfo => scopeInfo.name),
      redirectUri,
      permanent: this.state.durationInputIsPermanent,
      state
    });
    const authWindow = window.open(authUrl);

    const messageListener = event => {
      if (event.origin !== location.origin || event.data.state !== state) {
        return;
      }
      window.removeEventListener('message', messageListener);
      authWindow.close();
      snoowrap.fromAuthCode({ code: event.data.code, clientId, clientSecret, redirectUri }).then(userSnoowrap => {
        this.setState({ userSnoowrap, displayedAccessToken: userSnoowrap.accessToken });
      });
    };
    window.addEventListener('message', messageListener);
  }

  revokeTokens() {
    const userSnoowrap = this.state.userSnoowrap;
    const revokePromise = userSnoowrap.refreshToken ? userSnoowrap.revokeRefreshToken() : userSnoowrap.revokeAccessToken();

    return revokePromise.then(() => {
      this.setState(state => {
        return userSnoowrap === state.userSnoowrap ? { userSnoowrap: null } : {};
      });
    });
  }

  regenerateAccessToken() {
    const userSnoowrap = this.state.userSnoowrap;

    delete userSnoowrap.accessToken;
    return userSnoowrap.updateAccessToken().then(accessToken => {
      this.setState(state => {
        return userSnoowrap === state.userSnoowrap ? { displayedAccessToken: accessToken } : {};
      });
    });
  }
}

function ThemeSwitcher() {
  const toggleTheme = () => {
    const rootElm = document.querySelector(":root");
    const theme = rootElm.getAttribute("theme");

    if (theme === "dark") {
      rootElm.setAttribute("theme", "light");
    } else {
      rootElm.setAttribute("theme", "dark");
    }
  };

  return React.createElement(
    'label',
    { className: 'switch', onChange: toggleTheme },
    React.createElement('input', { type: 'checkbox' }),
    React.createElement('span', { className: 'slider round' })
  );
}

function AnonymousTokenDisplay({ anonymousToken, generateNewToken }) {
  const copy = () => navigator.clipboard.writeText(anonymousToken);
  return React.createElement(
    'div',
    null,
    React.createElement(
      'p',
      null,
      'Anonymous token (expires after 1 hour, cannot access account-specific information):',
      ' '
    ),
    React.createElement(
      'span',
      null,
      React.createElement('input', { type: 'text', readOnly: true, value: anonymousToken || '...loading' })
    ),
    React.createElement(
      'button',
      { disabled: !anonymousToken, onClick: generateNewToken },
      'Regenerate'
    ),
    React.createElement(
      'button',
      { disabled: !anonymousToken, onClick: copy },
      'Copy'
    )
  );
}

function ClientInfoInput(props) {
  return React.createElement(
    'div',
    null,
    React.createElement(
      'p',
      null,
      'Make sure to set the app redirect URI to ',
      React.createElement(
        'strong',
        null,
        window.location.origin + window.location.pathname
      ),
      '.',
      ' ',
      'If you don\'t, you will get an error page and will have to try again.'
    ),
    React.createElement('input', {
      type: 'text',
      placeholder: 'Client ID',
      value: props.clientIdInput,
      onChange: event => props.updateClientId(event.target.value)
    }),
    React.createElement('input', {
      type: 'text',
      placeholder: 'Client Secret',
      value: props.clientSecretInput,
      onChange: event => props.updateClientSecret(event.target.value)
    }),
    'Permanent? ',
    React.createElement('input', { type: 'checkbox', checked: props.durationInputIsPermanent, onChange: props.toggleDuration })
  );
}

function ScopeSelection(props) {
  const numSelectedScopes = props.scopeList.filter(scope => scope.selected).length;
  const selectAllCheckboxProps = {
    selected: numSelectedScopes === props.scopeList.length,
    indeterminate: numSelectedScopes > 0 && numSelectedScopes < props.scopeList.length,
    onSelectAll: props.onSelectAll
  };
  return React.createElement(
    'div',
    null,
    React.createElement(
      'table',
      null,
      React.createElement(
        'thead',
        null,
        React.createElement(
          'tr',
          null,
          React.createElement(
            'th',
            null,
            React.createElement(SelectAllCheckbox, selectAllCheckboxProps)
          ),
          React.createElement(
            'th',
            null,
            'Scope name'
          ),
          React.createElement(
            'th',
            null,
            'Scope description'
          )
        )
      ),
      React.createElement(
        'tbody',
        null,
        props.scopeList.map((scopeItem, index) => React.createElement(
          'tr',
          { key: scopeItem.name },
          React.createElement(
            'td',
            null,
            React.createElement('input', { type: 'checkbox', checked: scopeItem.selected, onChange: () => props.onScopeSelectedChange(index) })
          ),
          React.createElement(
            'td',
            null,
            React.createElement(
              'code',
              null,
              scopeItem.name
            )
          ),
          React.createElement(
            'td',
            null,
            scopeItem.description
          )
        ))
      )
    )
  );
}

class SelectAllCheckbox extends React.Component {
  render() {
    return React.createElement('input', {
      type: 'checkbox',
      checked: this.props.selected,
      onChange: this.props.onSelectAll,
      ref: node => this.node = node
    });
  }
  componentDidMount() {
    this.node.indeterminate = this.props.indeterminate;
  }
  componentDidUpdate() {
    this.node.indeterminate = this.props.indeterminate;
  }
}

function GenerateButton(props) {
  return React.createElement('input', { type: 'submit', value: 'Generate tokens', disabled: props.disabled, onClick: props.generateTokens });
}

function UserTokenDisplay(props) {
  const copyRefreshToken = () => navigator.clipboard.writeText(props.refreshToken);
  const copyAccessToken = () => navigator.clipboard.writeText(props.accessToken);

  return React.createElement(
    'div',
    null,
    props.refreshToken ? React.createElement(
      'div',
      null,
      'Refresh token: ',
      React.createElement('input', { type: 'text', readOnly: true, value: props.refreshToken }),
      React.createElement(
        'button',
        { onClick: copyRefreshToken },
        'Copy'
      )
    ) : React.createElement(
      'div',
      null,
      'Refresh token: (None, you selected a temporary duration)'
    ),
    React.createElement(
      'div',
      null,
      'Access token: ',
      React.createElement('input', { type: 'text', readOnly: true, value: props.accessToken }),
      React.createElement(
        'button',
        { onClick: copyAccessToken },
        'Copy'
      )
    ),
    React.createElement('input', { type: 'submit', value: 'Revoke these tokens', onClick: props.revokeTokens }),
    props.refreshToken && React.createElement('input', { type: 'submit', value: 'Regenerate access token', onClick: props.regenerateAccessToken })
  );
}

const searchParams = new URL(window.location).searchParams;
if (window.opener && searchParams.has('code')) {
  window.opener.postMessage({ code: searchParams.get('code'), state: searchParams.get('state') }, location.origin);
}

window.addEventListener('DOMContentLoaded', () => {
  ReactDOM.render(React.createElement(RedditOauthHelper, { anonymousClientId: '0Ry1TaKGFLtP5Q', deviceId: 'DO_NOT_TRACK_THIS_DEVICE' }), document.getElementById('app'));
});

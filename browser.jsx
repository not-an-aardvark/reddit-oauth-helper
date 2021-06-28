/* eslint-env browser */

'use strict';

class RedditOauthHelper extends React.Component {
  constructor (props) {
    super(props);

    this.state = {
      anonymousSnoowrap: null,
      scopeList: null,
      clientIdInput: '',
      clientSecretInput: '',
      durationInputIsPermanent: false,
      userSnoowrap: null,
      displayedAccessToken: null,
    };

    this.fetchAnonymousToken().then(anonymousSnoowrap => {
      return anonymousSnoowrap.getOauthScopeList().then(scopeResponse => {
        this.setState({
          scopeList: Object.keys(scopeResponse).sort().reduce((scopeList, scopeName) => {
            scopeList.push({ name: scopeName, description: scopeResponse[scopeName].description, selected: false });
            return scopeList;
          }, []),
        });
      });
    });
  }

  render () {
    return (
      <div>
        <h1>
          Reddit OAuth Helper <ThemeSwitcher />
        </h1>
        <h4>
          A tool to generate reddit OAuth tokens
        </h4>
        <AnonymousTokenDisplay
          anonymousToken={this.state.anonymousSnoowrap && this.state.anonymousSnoowrap.accessToken}
          generateNewToken={() => this.fetchAnonymousToken()}
        />
        <hr />
        <div>
          <h3>
            Generate Token
          </h3>
          <ClientInfoInput
            updateClientId={clientIdInput => this.setState({ clientIdInput: clientIdInput.trim() })}
            updateClientSecret={clientSecretInput => this.setState({ clientSecretInput: clientSecretInput.trim() })}
            toggleDuration={() => this.setState(state => ({ durationInputIsPermanent: !state.durationInputIsPermanent }))}
          />
          {
            this.state.scopeList
              ? <ScopeSelection
                scopeList={this.state.scopeList}
                onScopeSelectedChange={index => this.onScopeSelectedChange(index)}
                onSelectAll={() => this.onSelectAll()}
              />
              : <div>Loading scope selection...</div>
          }
          <GenerateButton disabled={!this.canSubmit()} generateTokens={() => this.generateTokens()} />
        </div>
        {
          this.state.userSnoowrap &&
            (
              <UserTokenDisplay
                refreshToken={this.state.userSnoowrap.refreshToken}
                accessToken={this.state.displayedAccessToken}
                revokeTokens={() => this.revokeTokens()}
                regenerateAccessToken={() => this.regenerateAccessToken()}
              />
            )
        }
      </div>
    );
  }

  fetchAnonymousToken () {
    const form = new FormData();
    form.set('grant_type', 'https://oauth.reddit.com/grants/installed_client');
    form.set('device_id', 'DO_NOT_TRACK_THIS_DEVICE');
    return fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'post',
      body: form,
      headers: { authorization: `Basic ${btoa(this.props.anonymousClientId + ':')}` },
      credentials: 'omit',
    }).then(response => response.text())
      .then(JSON.parse)
      .then(tokenInfo => tokenInfo.access_token)
      .then(anonymousToken => {
        const anonymousSnoowrap = new snoowrap({ accessToken: anonymousToken });
        anonymousSnoowrap.config({ proxies: false, requestDelay: 1000 });
        this.setState({ anonymousSnoowrap });
        return anonymousSnoowrap;
      });
  }

  onScopeSelectedChange (index) {
    this.setState(state => {
      const scopeListClone = state.scopeList.slice();

      scopeListClone[index] = { ...state.scopeList[index], selected: !state.scopeList[index].selected };

      return { scopeList: scopeListClone };
    });
  }

  onSelectAll () {
    this.setState(state => {
      const everythingAlreadySelected = state.scopeList.every(scope => scope.selected);
      return { scopeList: state.scopeList.map(scopeInfo => ({ ...scopeInfo, selected: !everythingAlreadySelected })) };
    });
  }

  canSubmit () {
    return this.state.clientIdInput && this.state.scopeList.some(scope => scope.selected);
  }

  generateTokens () {
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
      state,
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

  revokeTokens () {
    const userSnoowrap = this.state.userSnoowrap;
    const revokePromise = userSnoowrap.refreshToken
      ? userSnoowrap.revokeRefreshToken()
      : userSnoowrap.revokeAccessToken();

    return revokePromise.then(() => {
      this.setState(state => {
        return userSnoowrap === state.userSnoowrap ? { userSnoowrap: null } : {};
      });
    });
  }

  regenerateAccessToken () {
    const userSnoowrap = this.state.userSnoowrap;

    delete userSnoowrap.accessToken;
    return userSnoowrap.updateAccessToken().then(accessToken => {
      this.setState(state => {
        return userSnoowrap === state.userSnoowrap ? { displayedAccessToken: accessToken } : {};
      });
    });
  }
}

function ThemeSwitcher () {
  const toggleTheme = () => {
    const rootElm = document.querySelector(":root");
    const theme = rootElm.getAttribute("theme");

    if (theme === "dark") {
      rootElm.setAttribute("theme", "light");
    } else {
      rootElm.setAttribute("theme", "dark");
    }
  }

  return (
    <label className="switch" onChange={toggleTheme}>
      <input type="checkbox" />
      <span className="slider round"></span>
    </label>
  )
}

function AnonymousTokenDisplay ({ anonymousToken, generateNewToken }) {
  const copy = () => navigator.clipboard.writeText(anonymousToken)

  return (
    <div>
      <span>
        Anonymous token (expires after 1 hour, cannot access account-specific information):{' '}
      </span>
      <span>
        <input type="text" readOnly value={anonymousToken || '...loading'} />
      </span>
      <button disabled={!anonymousToken} onClick={generateNewToken}>
        Regenerate
      </button>
      <button disabled={!anonymousToken} onClick={copy}>
        Copy
      </button>
    </div>
  );
}

function ClientInfoInput (props) {
  return (
    <div>
      <p>
        Make sure to set the app redirect URI to <strong>{window.location.origin + window.location.pathname}</strong>.{' '}
        If you don&apos;t, you will get an error page and will have to try again.
      </p>
      <input
        type="text"
        placeholder="Client ID"
        value={props.clientIdInput}
        onChange={event => props.updateClientId(event.target.value)}
      />
      <input
        type="text"
        placeholder="Client Secret"
        value={props.clientSecretInput}
        onChange={event => props.updateClientSecret(event.target.value)}
      />
      Permanent? <input type="checkbox" checked={props.durationInputIsPermanent} onChange={props.toggleDuration} />
    </div>
  );
}

function ScopeSelection (props) {
  const numSelectedScopes = props.scopeList.filter(scope => scope.selected).length;
  const selectAllCheckboxProps = {
    selected: numSelectedScopes === props.scopeList.length,
    indeterminate: numSelectedScopes > 0 && numSelectedScopes < props.scopeList.length,
    onSelectAll: props.onSelectAll,
  };
  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>
              <SelectAllCheckbox {...selectAllCheckboxProps} />
            </th>
            <th>
              Scope name
            </th>
            <th>
              Scope description
            </th>
          </tr>
        </thead>
        <tbody>
          {
            props.scopeList.map((scopeItem, index) => (
              <tr key={scopeItem.name}>
                <td>
                  <input type="checkbox" checked={scopeItem.selected} onChange={() => props.onScopeSelectedChange(index)} />
                </td>
                <td>
                  <code>{scopeItem.name}</code>
                </td>
                <td>
                  {scopeItem.description}
                </td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}

class SelectAllCheckbox extends React.Component {
  render () {
    return <input
      type="checkbox"
      checked={this.props.selected}
      onChange={this.props.onSelectAll}
      ref={node => this.node = node}
    />;
  }
  componentDidMount () {
    this.node.indeterminate = this.props.indeterminate;
  }
  componentDidUpdate () {
    this.node.indeterminate = this.props.indeterminate;
  }
}

function GenerateButton (props) {
  return (
    <input type="submit" value="Generate tokens" disabled={props.disabled} onClick={props.generateTokens} />
  );
}

function UserTokenDisplay (props) {
  const copyRefreshToken = () => navigator.clipboard.writeText(props.refreshToken)
  const copyAccessToken = () => navigator.clipboard.writeText(props.accessToken)
  
  return (
    <div>
      {
        props.refreshToken
          ? <div>
            Refresh token: <input type="text" readOnly value={props.refreshToken} />
            <button onClick={copyRefreshToken}>
              Copy
            </button>
          </div>
          : <div>
            Refresh token: (None, you selected a temporary duration)
          </div>
      }
      <div>
        Access token: <input type="text" readOnly value={props.accessToken} />
        <button onClick={copyAccessToken}>
          Copy
        </button>
      </div>
      <input type="submit" value="Revoke these tokens" onClick={props.revokeTokens} />
      {
        props.refreshToken &&
          <input type="submit" value="Regenerate access token" onClick={props.regenerateAccessToken} />
      }
    </div>
  );
}

const searchParams = new URL(window.location).searchParams;
if (window.opener && searchParams.has('code')) {
  window.opener.postMessage({ code: searchParams.get('code'), state: searchParams.get('state') }, location.origin);
}

window.addEventListener('DOMContentLoaded', () => {
  ReactDOM.render(
    <RedditOauthHelper anonymousClientId="0Ry1TaKGFLtP5Q" deviceId="DO_NOT_TRACK_THIS_DEVICE" />,
    document.getElementById('app')
  );
});

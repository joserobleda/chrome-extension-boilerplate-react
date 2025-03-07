function XMLHttpRequest() {
  let _url;
  let _method = 'GET';
  let _callback = function () { };
  let _headers = {};

  this.responseUrl = null;
  this.onload = () => { }

  this.open = (method, url) => {
    _method = method;
    _url = url;
  }

  this.setRequestHeader = (key, val) => {
    _headers[key] = val;
  }

  this.send = body => {
    // console.log('send', _url, _method, _headers, body)
    fetch(_url, {
      method: _method,
      headers: _headers,
      body,
    }).then(response => {
      this.responseURL = response.url;
      this.status = 200;
      this.statusText = 'OK';
      let textHeaders = '';
      response.headers.forEach((val, header) => {
        textHeaders += `${header}: ${val}\n`;
      });

      this.getAllResponseHeaders = () => textHeaders;

      response.text().then(responseText => {
        this.responseText = responseText;

        try {
          this.onload();
        } catch (e) {
          console.error(e);
        }
      })
    }, err => {
      console.error('ko', err)
    });
  }
}

self.XMLHttpRequest = XMLHttpRequest;

self.localStorage = function () {
  this.clear = function () { return chrome.storage.local.clear(); }
  this.key = function (e) { throw new Error('method not available'); }
  this.setItem = function (e, t) {
    console.log('set', e, t)
    return chrome.storage.local.set({ [e]: t })
  }
  this.getItem = function (e) {
    console.log('get', e)
    return chrome.storage.local.get(e)
  }
  this.removeItem = function (e) { return chrome.storage.local.remove(e) }
}
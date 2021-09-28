// Supabase GoTrueClient use persistence only when it runs on browsers
self.window = {};

let VALUE = undefined;
let STORAGE_KEY = 'supabase.auth.token';
const chromeStorage = chrome.storage.local;

class ChromeLocalStorage {
  getItem(key) {
    if (key == STORAGE_KEY) return VALUE;

    throw new Error(`Cannot retrieve non ${STORAGE_KEY} keys from ChromeLocalStorage`);
  }

  setItem(key, value) {
    chromeStorage.set({ [key]: value }, function () {
      VALUE = value;
    });
  }

  removeItem(key) {
    chromeStorage.remove(key, function () {
      VALUE = undefined;
    });
  }
}

// we need sync return
ChromeLocalStorage.preLoad = function () {
  return new Promise((resolve, reject) => {
    chromeStorage.get(STORAGE_KEY, function (results) {
      VALUE = results[STORAGE_KEY];

      resolve();
    });
  })
}

ChromeLocalStorage.setToken = function (token) {
  if (typeof token !== 'string') token = JSON.stringify(token);
  return new Promise((resolve, reject) => {
    chromeStorage.set({ [STORAGE_KEY]: token }, function () {
      VALUE = token;

      resolve();
    });
  })
}

export default ChromeLocalStorage;
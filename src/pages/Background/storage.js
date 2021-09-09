// Supabase GoTrueClient use persistence only when it runs on browsers
self.window = {};

let VALUE = undefined;
let STORAGE_KEY = 'supabase.auth.token';

class ChromeLocalStorage {
  getItem(key) {
    if (key == STORAGE_KEY) return VALUE;

    throw new Error(`Cannot retrieve non ${STORAGE_KEY} keys from ChromeLocalStorage`);
  }

  setItem(key, value) {
    chrome.storage.local.set({ [key]: value }, function () {
      VALUE = value;
    });
  }

  removeItem(key) {
    chrome.storage.local.remove(key, function () {
      VALUE = undefined;
    });
  }
}

// we need sync return
ChromeLocalStorage.preLoad = function () {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEY, function (results) {
      VALUE = results[STORAGE_KEY];

      resolve();
    });
  })
}

export default ChromeLocalStorage;
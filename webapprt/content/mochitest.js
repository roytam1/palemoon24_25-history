/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Note: this script is loaded by both mochitest.xul and head.js, so make sure
 * the code you put here can be evaluated by both! */

const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://webapprt/modules/WebappRT.jsm");

const MANIFEST_URL_BASE = Services.io.newURI(
  "http://mochi.test:8888/webapprtChrome/webapprt/test/chrome/", null, null);

// When WebappsHandler opens an install confirmation dialog for apps we install,
// close it, which will be seen as the equivalent of cancelling the install.
// This doesn't prevent us from installing those apps, as we listen for the same
// notification as WebappsHandler and do the install ourselves.  It just
// prevents the modal installation confirmation dialogs from hanging tests.
Services.ww.registerNotification({
  observe: function(win, topic) {
    if (topic == "domwindowopened") {
      // Wait for load because the window is not yet sufficiently initialized.
      win.addEventListener("load", function onLoadWindow() {
        win.removeEventListener("load", onLoadWindow, false);
        if (win.location == "chrome://global/content/commonDialog.xul" &&
            win.opener == window) {
          win.close();
        }
      }, false);
    }
  }
});

/**
 * Transmogrify the runtime session into one for the given webapp.
 *
 * @param {String} manifestURL
 *        The URL of the webapp's manifest, relative to the base URL.
 *        Note that the base URL points to the *chrome* WebappRT mochitests,
 *        so you must supply an absolute URL to manifests elsewhere.
 * @param {Object} parameters
 *        The value to pass as the "parameters" argument to
 *        mozIDOMApplicationRegistry.install, e.g., { receipts: ... }.
 *        Use undefined to pass nothing.
 * @param {Function} onBecome
 *        The callback to call once the transmogrification is complete.
 */
function becomeWebapp(manifestURL, parameters, onBecome) {
  function observeInstall(subj, topic, data) {
    Services.obs.removeObserver(observeInstall, "webapps-ask-install");

    // Step 2: Configure the runtime session to represent the app.
    // We load DOMApplicationRegistry into a local scope to avoid appearing
    // to leak it.

    let scope = {};
    Cu.import("resource://gre/modules/Webapps.jsm", scope);
    scope.DOMApplicationRegistry.confirmInstall(JSON.parse(data));

    let installRecord = JSON.parse(data);
    installRecord.mm = subj;
    installRecord.registryDir = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
    WebappRT.config = installRecord;

    onBecome();
  }
  Services.obs.addObserver(observeInstall, "webapps-ask-install", false);

  // Step 1: Install the app at the URL specified by the manifest.
  let url = Services.io.newURI(manifestURL, null, MANIFEST_URL_BASE);
  navigator.mozApps.install(url.spec, parameters);
}

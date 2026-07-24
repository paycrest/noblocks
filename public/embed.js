/**
 * Noblocks Embed SDK (host side).
 *
 * Lets a partner page hand its connected EIP-1193 wallet (MetaMask,
 * WalletConnect, AppKit, wagmi's connector client, ...) to an embedded
 * Noblocks widget iframe, and receive widget lifecycle events.
 *
 * Usage:
 *   <script src="https://noblocks.xyz/embed.js"></script>
 *   <iframe id="noblocks" src="https://noblocks.xyz/widget?injected=bridge"></iframe>
 *   <script>
 *     const unbind = NoblocksEmbed.bindWallet(
 *       document.getElementById("noblocks"),
 *       provider, // any EIP-1193 provider, e.g. window.ethereum
 *       {
 *         onEvent(event, payload) {
 *           if (event === "noblocks:resize") iframe.style.height = payload.height + "px";
 *         },
 *       }
 *     );
 *   </script>
 *
 * Call bindWallet before (or immediately after) adding the iframe so no
 * request from the widget is missed. Signing prompts appear in the host
 * wallet's own UI; the widget never sees keys. Dismissing the iframe
 * (modal backdrop, host close control, etc.) is owned by the host page.
 */
(function () {
  "use strict";

  var DEFAULT_WIDGET_ORIGIN = "https://noblocks.xyz";

  /**
   * @param {HTMLIFrameElement} iframeEl - the widget iframe
   * @param {{ request: Function, on?: Function, removeListener?: Function }} provider
   *   EIP-1193 provider whose requests the widget will proxy
   * @param {{ origin?: string, onEvent?: (event: string, payload: any) => void }} [options]
   *   origin: widget origin if not noblocks.xyz (e.g. http://localhost:3000)
   *   onEvent: called for every widget event (noblocks:ready/resize/tx_status)
   * @returns {() => void} unbind function
   */
  function bindWallet(iframeEl, provider, options) {
    if (!iframeEl || typeof iframeEl.contentWindow === "undefined") {
      throw new Error("NoblocksEmbed.bindWallet: iframeEl must be an <iframe> element");
    }
    if (!provider || typeof provider.request !== "function") {
      throw new Error("NoblocksEmbed.bindWallet: provider must be an EIP-1193 provider");
    }
    var opts = options || {};
    var widgetOrigin = opts.origin || DEFAULT_WIDGET_ORIGIN;

    function postToWidget(event, payload) {
      if (!iframeEl.contentWindow) return;
      iframeEl.contentWindow.postMessage(
        { source: "noblocks-host", event: event, payload: payload },
        widgetOrigin
      );
    }

    function onMessage(event) {
      if (event.origin !== widgetOrigin) return;
      if (!iframeEl.contentWindow || event.source !== iframeEl.contentWindow) return;
      var data = event.data;
      if (!data || data.source !== "noblocks") return;

      if (data.event === "noblocks:wallet_request") {
        var payload = data.payload || {};
        // Immediate receipt ACK: the widget fast-falls-back to its standard
        // login flow when no bridge is listening, so acknowledge before the
        // (potentially slow, user-interactive) provider call.
        postToWidget("noblocks:wallet_ack", { id: payload.id });
        provider
          .request({ method: payload.method, params: payload.params })
          .then(function (result) {
            postToWidget("noblocks:wallet_response", { id: payload.id, result: result });
          })
          .catch(function (error) {
            postToWidget("noblocks:wallet_response", {
              id: payload.id,
              error: {
                code: typeof (error && error.code) === "number" ? error.code : -32603,
                message: (error && error.message) || "Host wallet request failed",
              },
            });
          });
        return;
      }

      if (typeof opts.onEvent === "function") {
        opts.onEvent(data.event, data.payload);
      }
    }

    window.addEventListener("message", onMessage);

    // Forward wallet lifecycle events into the widget.
    var forwarded = ["accountsChanged", "chainChanged", "disconnect"].map(function (name) {
      var handler = function (eventData) {
        postToWidget("noblocks:wallet_event", { event: name, data: eventData });
      };
      if (typeof provider.on === "function") provider.on(name, handler);
      return { name: name, handler: handler };
    });

    return function unbind() {
      window.removeEventListener("message", onMessage);
      forwarded.forEach(function (entry) {
        if (typeof provider.removeListener === "function") {
          provider.removeListener(entry.name, entry.handler);
        }
      });
    };
  }

  window.NoblocksEmbed = { bindWallet: bindWallet };
})();

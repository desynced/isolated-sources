import "./styles.css";
import { pageChunksReady } from "./preload.js";
import { mount } from "./app.js";
import { PAYPAL_ME_URL } from "./config.js";
import { mountMetadata } from "./metadata-panel.js";
import { applyTipLink } from "./tip.js";

const anchor = document.querySelector("#tip-link");
const item = document.querySelector("#tip-item");
if (anchor instanceof HTMLAnchorElement && item instanceof HTMLElement) {
  applyTipLink(anchor, item, PAYPAL_ME_URL);
}

window.__pageChunksReady = pageChunksReady;
mount(document);
mountMetadata(document);

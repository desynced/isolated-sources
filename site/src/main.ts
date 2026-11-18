import "./styles.css";
import { mount } from "./app.js";
import { PAYPAL_ME_URL } from "./config.js";
import { applyTipLink } from "./tip.js";

const anchor = document.querySelector("#tip-link");
const item = document.querySelector("#tip-item");
if (anchor instanceof HTMLAnchorElement && item instanceof HTMLElement) {
  applyTipLink(anchor, item, PAYPAL_ME_URL);
}

mount(document);

import type { Recognizer } from "../types.js";
import { BatesNumberRecognizer, CaseNumberRecognizer, DocketNumberRecognizer, JudgePartyRecognizer, MatterNumberRecognizer } from "./legal.js";
import { CreditCardRecognizer } from "./credit-card.js";
import { DateOfBirthRecognizer } from "./date-of-birth.js";
import { EmailRecognizer } from "./email.js";
import { IbanRecognizer } from "./iban.js";
import { IpRecognizer } from "./ip.js";
import { PhoneRecognizer } from "./phone.js";
import { UrlRecognizer } from "./url.js";
import { UsAddressRecognizer } from "./us-address.js";
import { UsDriverLicenseRecognizer } from "./us-driver-license.js";
import { UsPassportRecognizer } from "./us-passport.js";
import { UsSsnRecognizer } from "./us-ssn.js";

/** Fresh instances of the built-in recognizers, Presidio ports first. */
export function createDefaultRecognizers(): Recognizer[] {
  return [
    new EmailRecognizer(),
    new PhoneRecognizer(),
    new UsSsnRecognizer(),
    new CreditCardRecognizer(),
    new IbanRecognizer(),
    new IpRecognizer(),
    new UrlRecognizer(),
    new DateOfBirthRecognizer(),
    new UsAddressRecognizer(),
    new UsDriverLicenseRecognizer(),
    new UsPassportRecognizer(),
    new CaseNumberRecognizer(),
    new DocketNumberRecognizer(),
    new BatesNumberRecognizer(),
    new MatterNumberRecognizer(),
    new JudgePartyRecognizer(),
  ];
}

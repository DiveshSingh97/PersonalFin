import { describe, expect, it } from "vitest";
import {
  buildMerchantKey,
  cleanMerchantDescription,
  normalizeMerchantDescription
} from "@/lib/transactions/merchant-normalization";

describe("normalizeMerchantDescription", () => {
  it.each([
    ["PURCH DL UBER 400738******4647", "Uber", "uber"],
    ["PURCH DL New Uber Eats 400738******4647", "Uber Eats", "uber-eats"],
    ["PURCH WOOLWORTHS 400738******4647", "Woolworths", "woolworths"],
    ["PURCH OPENAI *CHATGPT SUB 400738******0166", "OpenAI / ChatGPT", "openai-chatgpt"],
    ["#MONTHLY ACCOUNT FEE", "FNB Monthly Account Fee", "fnb-monthly-account-fee"],
    ["#SERVICE FEES", "Bank Service Fees", "bank-service-fees"],
    ["PURCH Google YouTubePremi 400738******4647", "YouTube Premium", "youtube-premium"],
    ["PURCH SpotifyZA 400738******4647", "Spotify", "spotify"],
    ["PURCH Luno 400738******4647", "Luno", "luno"]
  ])("normalizes %s", (description, displayName, key) => {
    expect(normalizeMerchantDescription(description)).toMatchObject({
      displayName,
      normalizedKey: key
    });
  });

  it("removes masked card suffixes while preserving merchant text", () => {
    expect(cleanMerchantDescription("PURCH SOME SHOP 400738******4647")).toBe("SOME SHOP");
    expect(cleanMerchantDescription("PURCH SOME SHOP 400738 4647")).toBe("SOME SHOP");
  });
});

describe("buildMerchantKey", () => {
  it("builds deterministic lowercase merchant keys", () => {
    expect(buildMerchantKey("OpenAI / ChatGPT")).toBe("openai-chatgpt");
    expect(buildMerchantKey("Uber Eats")).toBe("uber-eats");
  });
});

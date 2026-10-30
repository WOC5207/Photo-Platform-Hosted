import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { applyTextOverrides } from "@/lib/textOverrideRules";
import { loadTextOverrides } from "@/lib/textOverrides";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // Platform admins can reword menu text in place on the new site; their
  // wording replaces the built-in text for every visitor.
  const [messages, overrides] = await Promise.all([
    import(`../../messages/${locale}.json`).then((m) => m.default),
    loadTextOverrides(locale)
  ]);
  return { locale, messages: applyTextOverrides(messages, overrides) };
});

import { invoke } from "@tauri-apps/api/core";
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import zhCN from "../locales/zh-CN.json";
import { buildMenuLabels } from "./menuLabels";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      "zh-CN": { translation: zhCN },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "zh-CN"],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "ovid:language",
    },
    interpolation: {
      escapeValue: false,
    },
  })
  .then(() => {
    void invoke("set_menu_language", { labels: buildMenuLabels(i18n.t.bind(i18n)) });
  });

export default i18n;

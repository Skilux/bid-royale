import { TENDER } from "@/lib/config";
import { PERSONAS, SUPPLIER_IDS } from "@/lib/supplier-agents/personas";

export const AGENT_NAMES = [...SUPPLIER_IDS, "board"];
export const isAgentName = (name) => AGENT_NAMES.includes(name);

const IMPRESSIONS = {
  id: "impressions",
  type: "number",
  name: "Impressions",
  data: { description: "Ad impressions to deliver on this property", placeholder: "1000" },
  validations: [
    { validation: "min", value: "100" },
    { validation: "max", value: "10000" },
    { validation: "format", value: "integer" },
  ],
};

const BRIEF = {
  id: "brief",
  type: "string",
  name: "Campaign brief",
  data: { description: "What the advertiser wants to promote and to whom", placeholder: "Signups for the NeoRack developer tool" },
  validations: [{ validation: "format", value: "nonempty" }],
};

/** MIP-003 Attachment 01 documents, one per agent. */
export function inputSchema(name) {
  return { input_data: [name === "board" ? BRIEF : IMPRESSIONS] };
}

/** Requested funds in ADA for one job: supplier slot price per 1,000 impressions, the Board's bid fee. */
export function priceFor(name, inputData) {
  if (name === "board") return TENDER.bidFee;
  return Math.round(PERSONAS[name].pinned.price * (inputData.impressions / 1000) * 1e6) / 1e6;
}

/** Returns an error message, or null when `inputData` satisfies the agent's schema. */
export function validateInput(name, inputData) {
  if (!inputData || typeof inputData !== "object" || Array.isArray(inputData)) return "input_data must be an object";
  for (const field of inputSchema(name).input_data) {
    const rules = Object.fromEntries(field.validations.map((v) => [v.validation, v.value]));
    const value = inputData[field.id];
    if (value === undefined || value === null) return `input_data.${field.id} is required`;
    if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) return `input_data.${field.id} must be a number`;
      if (rules.format === "integer" && !Number.isInteger(value)) return `input_data.${field.id} must be an integer`;
      if (value < Number(rules.min) || value > Number(rules.max)) {
        return `input_data.${field.id} must be between ${rules.min} and ${rules.max}`;
      }
    } else {
      if (typeof value !== "string") return `input_data.${field.id} must be a string`;
      if (rules.format === "nonempty" && !value.trim()) return `input_data.${field.id} must not be empty`;
    }
  }
  return null;
}

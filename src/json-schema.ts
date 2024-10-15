import type {
  JsonSchema7Type,
  JsonSchema7ObjectType,
} from "zod-to-json-schema";

const capitalizeFromCamelCase = (camel: string): string => {
  const words = camel
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .split(" ");
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const flattenedProperties = (
  schema: JsonSchema7Type
): JsonSchema7ObjectType["properties"] => {
  if ("properties" in schema) {
    return schema.properties as JsonSchema7ObjectType["properties"];
  }
  if ("allOf" in schema) {
    return Object.fromEntries(
      schema.allOf!.flatMap((subSchema) =>
        Object.entries(flattenedProperties(subSchema as JsonSchema7Type))
      )
    );
  }
  if ("anyOf" in schema) {
    const entries = schema.anyOf!.flatMap((subSchema) =>
      Object.entries(flattenedProperties(subSchema as JsonSchema7Type))
    );

    return Object.fromEntries(entries);
  }
  return {};
};

/** For a union type, returns a list of pairs of properties which *shouldn't* be used together (because they don't appear in the same type variant) */
export const incompatiblePropertyPairs = (
  schema: JsonSchema7Type
): Array<[string, string]> => {
  if (!("anyOf" in schema)) return [];

  const sets = schema.anyOf!.map((subSchema) => {
    const keys = Object.keys(flattenedProperties(subSchema as JsonSchema7Type));
    return { keys, set: new Set(keys) };
  });

  const compatibilityEntries = sets.flatMap(({ keys, set }) => {
    return keys.map((key) => {
      const compatibleKeys = sets
        .filter((other) => other.set.has(key))
        .flatMap((other) => other.keys);
      return [key, new Set(compatibleKeys)] as const;
    });
  });

  const allKeys = [...new Set(sets.flatMap(({ keys }) => keys))];

  return compatibilityEntries.flatMap(([key, compatibleWith]) => {
    return allKeys
      .filter((other) => key < other && !compatibleWith.has(other))
      .map((other): [string, string] => [key, other]);
  });
};

/**
 * Tries fairly hard to build a roughly human-readable description of a JSON Schema type.
 */
export const getDescription = (schema: JsonSchema7Type): string => {
  if ("items" in schema) {
    return [getDescription(schema.items as JsonSchema7Type), "(array)"]
      .filter(Boolean)
      .join(" ");
  }

  const entries = Object.entries(schema)
    .filter(
      ([key]) => !["type", "default", "additionalProperties"].includes(key)
    )
    .sort(([a], [b]) =>
      a === "description" ? -1 : b === "description" ? 1 : 0
    )
    .map(([key, value]) => {
      if (key === "description") return String(value);
      if (key === "properties") return `Object (JSON formatted)`;
      return `${capitalizeFromCamelCase(key)}: ${String(value)}`;
    });

  return entries.join("; ") || "";
};

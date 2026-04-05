import type { JsonValue } from './diffJson';

type JsonType = 'null' | 'boolean' | 'integer' | 'number' | 'string' | 'object' | 'array';
type StringFormat = 'date-time' | 'date' | 'email' | 'uuid' | 'uri' | 'ipv4' | 'ipv6';
type JsonObject = Record<string, JsonValue>;

export type JsonSchema = {
  [key: string]: unknown;
};

const DRAFT_2020_12_URL = 'https://json-schema.org/draft/2020-12/schema';

const typeOrder: Record<JsonType, number> = {
  object: 0,
  array: 1,
  string: 2,
  integer: 3,
  number: 4,
  boolean: 5,
  null: 6,
};

const stringFormats: Array<{ format: StringFormat; test: (value: string) => boolean }> = [
  {
    format: 'date-time',
    test: (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+\-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)),
  },
  {
    format: 'date',
    test: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
  },
  {
    format: 'email',
    test: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  },
  {
    format: 'uuid',
    test: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  },
  {
    format: 'ipv4',
    test: (value) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(value),
  },
  {
    format: 'ipv6',
    test: (value) => /^[0-9a-f:]+$/i.test(value) && value.includes(':'),
  },
  {
    format: 'uri',
    test: (value) => {
      try {
        const url = new URL(value);
        return Boolean(url.protocol && url.hostname);
      } catch {
        return false;
      }
    },
  },
];

export function generateJsonSchema(sample: JsonValue): JsonSchema {
  return {
    $schema: DRAFT_2020_12_URL,
    title: 'Generated JSON Schema',
    ...inferSchemaFromSamples([sample]),
  };
}

function inferSchemaFromSamples(samples: JsonValue[]): JsonSchema {
  if (samples.length === 0) {
    return {};
  }

  const kinds = getCanonicalKinds(samples);

  if (kinds.length === 1) {
    return inferSchemaForKind(samples, kinds[0]);
  }

  if (kinds.length === 2 && kinds.includes('null')) {
    const nonNullKind = kinds.find((kind) => kind !== 'null');

    if (nonNullKind) {
      const nonNullSchema = inferSchemaForKind(filterSamplesByKind(samples, nonNullKind), nonNullKind);
      const typeValue = nonNullSchema.type;

      if (typeof typeValue === 'string' && typeValue !== 'object' && typeValue !== 'array') {
        return {
          ...nonNullSchema,
          type: sortTypes([typeValue as JsonType, 'null']),
        };
      }
    }
  }

  if (kinds.every((kind) => kind !== 'object' && kind !== 'array')) {
    return {
      type: sortTypes(kinds),
    };
  }

  return {
    anyOf: dedupeSchemas(
      kinds.map((kind) => inferSchemaForKind(filterSamplesByKind(samples, kind), kind))
    ),
  };
}

function inferSchemaForKind(samples: JsonValue[], kind: JsonType): JsonSchema {
  switch (kind) {
    case 'null':
      return { type: 'null' };
    case 'boolean':
      return { type: 'boolean' };
    case 'integer':
      return { type: 'integer' };
    case 'number':
      return { type: 'number' };
    case 'string':
      return inferStringSchema(samples as string[]);
    case 'array':
      return inferArraySchema(samples as JsonValue[][]);
    case 'object':
      return inferObjectSchema(samples as JsonObject[]);
  }
}

function inferStringSchema(values: string[]): JsonSchema {
  const schema: JsonSchema = { type: 'string' };
  const formats = values.map(detectStringFormat).filter((format): format is StringFormat => Boolean(format));

  if (formats.length === values.length && new Set(formats).size === 1) {
    schema.format = formats[0];
  }

  return schema;
}

function inferArraySchema(values: JsonValue[][]): JsonSchema {
  const items = values.flat();

  return {
    type: 'array',
    items: items.length > 0 ? inferSchemaFromSamples(items) : {},
  };
}

function inferObjectSchema(values: JsonObject[]): JsonSchema {
  const keyOrder: string[] = [];
  const seenKeys = new Set<string>();

  for (const value of values) {
    for (const key of Object.keys(value)) {
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      keyOrder.push(key);
    }
  }

  const properties = Object.fromEntries(
    keyOrder.map((key) => [
      key,
      inferSchemaFromSamples(
        values
          .filter((value) => Object.hasOwn(value, key))
          .map((value) => value[key] as JsonValue)
      ),
    ])
  );

  const required = keyOrder.filter((key) => values.every((value) => Object.hasOwn(value, key)));

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function detectStringFormat(value: string): StringFormat | null {
  for (const candidate of stringFormats) {
    if (candidate.test(value)) {
      return candidate.format;
    }
  }

  return null;
}

function getCanonicalKinds(samples: JsonValue[]): JsonType[] {
  const kinds = new Set(samples.map(getJsonType));

  if (kinds.has('number')) {
    kinds.delete('integer');
  }

  return sortTypes([...kinds]);
}

function filterSamplesByKind(samples: JsonValue[], kind: JsonType): JsonValue[] {
  return samples.filter((sample) => {
    const sampleKind = getJsonType(sample);
    return kind === 'number' ? sampleKind === 'number' || sampleKind === 'integer' : sampleKind === kind;
  });
}

function getJsonType(value: JsonValue): JsonType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';

  switch (typeof value) {
    case 'boolean':
      return 'boolean';
    case 'number':
      return Number.isInteger(value) ? 'integer' : 'number';
    case 'string':
      return 'string';
    default:
      return 'object';
  }
}

function sortTypes(types: JsonType[]) {
  return [...types].sort((left, right) => typeOrder[left] - typeOrder[right]);
}

function dedupeSchemas(schemas: JsonSchema[]) {
  return [...new Map(schemas.map((schema) => [JSON.stringify(schema), schema])).values()];
}

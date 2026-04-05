export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonValueKind = 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';
export type DiffValueType = JsonValueKind | 'missing';
export type DiffKind = 'added' | 'removed' | 'changed' | 'type_changed';

export type DiffEntry = {
  path: string;
  depth: number;
  kind: DiffKind;
  leftType: DiffValueType;
  rightType: DiffValueType;
  leftValue?: JsonValue;
  rightValue?: JsonValue;
  leftPreview?: string;
  rightPreview?: string;
};

export type JsonDiffSummary = {
  equal: boolean;
  totalChanges: number;
  added: number;
  removed: number;
  changed: number;
  typeChanged: number;
  leftNodes: number;
  rightNodes: number;
  maxDepth: number;
};

export type JsonDiffReport = {
  equal: boolean;
  summary: JsonDiffSummary;
  changes: DiffEntry[];
};

type PathSegment = string | number;

function detectType(value: JsonValue): JsonValueKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as Exclude<JsonValueKind, 'array' | 'null'>;
}

function formatPath(path: PathSegment[]): string {
  if (path.length === 0) return '$';

  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') {
      return `${acc}[${segment}]`;
    }

    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
      return `${acc}.${segment}`;
    }

    return `${acc}[${JSON.stringify(segment)}]`;
  }, '$');
}

function formatPreview(value: JsonValue | undefined, type: DiffValueType) {
  if (type === 'missing' || value === undefined) return undefined;

  const serialized = JSON.stringify(value);
  if (!serialized) return String(value);
  if (serialized.length <= 140) return serialized;
  return `${serialized.slice(0, 137)}...`;
}

function countNodes(value: JsonValue, depth = 0): { total: number; maxDepth: number } {
  if (value === null || typeof value !== 'object') {
    return { total: 1, maxDepth: depth };
  }

  if (Array.isArray(value)) {
    let total = 1;
    let maxDepth = depth;

    for (const item of value) {
      const childStats = countNodes(item, depth + 1);
      total += childStats.total;
      maxDepth = Math.max(maxDepth, childStats.maxDepth);
    }

    return { total, maxDepth };
  }

  let total = 1;
  let maxDepth = depth;

  for (const child of Object.values(value)) {
    const childStats = countNodes(child, depth + 1);
    total += childStats.total;
    maxDepth = Math.max(maxDepth, childStats.maxDepth);
  }

  return { total, maxDepth };
}

function createEntry(
  kind: DiffKind,
  path: PathSegment[],
  leftValue: JsonValue | undefined,
  rightValue: JsonValue | undefined,
  leftType: DiffValueType,
  rightType: DiffValueType
): DiffEntry {
  return {
    path: formatPath(path),
    depth: path.length,
    kind,
    leftType,
    rightType,
    leftValue,
    rightValue,
    leftPreview: formatPreview(leftValue, leftType),
    rightPreview: formatPreview(rightValue, rightType),
  };
}

function diffValue(left: JsonValue, right: JsonValue, path: PathSegment[], changes: DiffEntry[]) {
  const leftType = detectType(left);
  const rightType = detectType(right);

  if (leftType !== rightType) {
    changes.push(createEntry('type_changed', path, left, right, leftType, rightType));
    return;
  }

  if (leftType === 'array' && rightType === 'array') {
    const leftArray = left as JsonValue[];
    const rightArray = right as JsonValue[];
    const maxLength = Math.max(leftArray.length, rightArray.length);

    for (let index = 0; index < maxLength; index += 1) {
      const nextPath = [...path, index];
      const hasLeft = index < leftArray.length;
      const hasRight = index < rightArray.length;

      if (!hasLeft && hasRight) {
        changes.push(createEntry('added', nextPath, undefined, rightArray[index], 'missing', detectType(rightArray[index])));
        continue;
      }

      if (hasLeft && !hasRight) {
        changes.push(createEntry('removed', nextPath, leftArray[index], undefined, detectType(leftArray[index]), 'missing'));
        continue;
      }

      diffValue(leftArray[index], rightArray[index], nextPath, changes);
    }

    return;
  }

  if (leftType === 'object' && rightType === 'object') {
    const leftObject = left as Record<string, JsonValue>;
    const rightObject = right as Record<string, JsonValue>;
    const keys = Array.from(new Set([...Object.keys(leftObject), ...Object.keys(rightObject)])).sort((a, b) => a.localeCompare(b));

    for (const key of keys) {
      const nextPath = [...path, key];
      const hasLeft = Object.hasOwn(leftObject, key);
      const hasRight = Object.hasOwn(rightObject, key);

      if (!hasLeft && hasRight) {
        const rightValue = rightObject[key];
        changes.push(createEntry('added', nextPath, undefined, rightValue, 'missing', detectType(rightValue)));
        continue;
      }

      if (hasLeft && !hasRight) {
        const leftValue = leftObject[key];
        changes.push(createEntry('removed', nextPath, leftValue, undefined, detectType(leftValue), 'missing'));
        continue;
      }

      diffValue(leftObject[key], rightObject[key], nextPath, changes);
    }

    return;
  }

  if (left !== right) {
    changes.push(createEntry('changed', path, left, right, leftType, rightType));
  }
}

export function diffJson(left: JsonValue, right: JsonValue): JsonDiffReport {
  const changes: DiffEntry[] = [];
  diffValue(left, right, [], changes);

  const leftStats = countNodes(left);
  const rightStats = countNodes(right);
  const summary: JsonDiffSummary = {
    equal: changes.length === 0,
    totalChanges: changes.length,
    added: changes.filter((change) => change.kind === 'added').length,
    removed: changes.filter((change) => change.kind === 'removed').length,
    changed: changes.filter((change) => change.kind === 'changed').length,
    typeChanged: changes.filter((change) => change.kind === 'type_changed').length,
    leftNodes: leftStats.total,
    rightNodes: rightStats.total,
    maxDepth: Math.max(leftStats.maxDepth, rightStats.maxDepth),
  };

  return {
    equal: summary.equal,
    summary,
    changes,
  };
}

export function isDiffReport(value: unknown): value is JsonDiffReport {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<JsonDiffReport>;
  return (
    typeof candidate.equal === 'boolean'
    && !!candidate.summary
    && Array.isArray(candidate.changes)
  );
}

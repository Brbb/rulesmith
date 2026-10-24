export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type PayloadPath = (string | number)[];
export type JsonType =
  "string" | "number" | "boolean" | "object" | "array" | "null";
export function jsonType(value: JsonValue): JsonType {
  return value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : (typeof value as JsonType);
}
export function emptyValue(type: JsonType): JsonValue {
  return {
    string: "",
    number: 0,
    boolean: false,
    object: {},
    array: [],
    null: null,
  }[type];
}
export function parsePayload(text: string): {
  value?: JsonObject;
  error?: string;
} {
  try {
    const value = JSON.parse(text);
    if (value === null || Array.isArray(value) || typeof value !== "object")
      return { error: "The test payload must be a JSON object." };
    const pending: unknown[] = [value];
    while (pending.length) {
      const item = pending.pop();
      if (typeof item === "number" && !Number.isFinite(item))
        return { error: "JSON numbers must be finite." };
      if (item !== null && typeof item === "object")
        for (const child of Object.values(item)) pending.push(child);
    }
    return { value };
  } catch {
    return { error: "Fix the JSON syntax before switching to the form." };
  }
}
/** Copy only ancestors. Object.fromEntries preserves unusual keys as inert own properties. */
export function setPayloadValue(
  root: JsonValue,
  path: PayloadPath,
  value: JsonValue,
): JsonValue {
  if (!path.length) return value;
  const [key, ...rest] = path;
  if (Array.isArray(root))
    return root.map((item, index) =>
      index === key ? setPayloadValue(item, rest, value) : item,
    );
  if (root !== null && typeof root === "object" && Object.hasOwn(root, key))
    return Object.fromEntries(
      Object.entries(root).map(([name, item]) => [
        name,
        name === key ? setPayloadValue(item, rest, value) : item,
      ]),
    );
  return root;
}
export function removePayloadValue(
  root: JsonValue,
  path: PayloadPath,
): JsonValue {
  if (!path.length) return root;
  const parentPath = path.slice(0, -1),
    key = path[path.length - 1];
  const parent = valueAt(root, parentPath);
  if (Array.isArray(parent))
    return setPayloadValue(
      root,
      parentPath,
      parent.filter((_, index) => index !== key),
    );
  if (parent !== null && typeof parent === "object")
    return setPayloadValue(
      root,
      parentPath,
      Object.fromEntries(
        Object.entries(parent).filter(([name]) => name !== key),
      ),
    );
  return root;
}
export function valueAt(root: JsonValue, path: PayloadPath): JsonValue {
  let value = root;
  for (const key of path) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key))
      throw new Error("Field no longer exists.");
    value = (value as JsonObject)[key];
  }
  return value;
}
export function renamePayloadField(
  root: JsonValue,
  path: PayloadPath,
  name: string,
): JsonValue {
  const oldName = path[path.length - 1],
    parentPath = path.slice(0, -1);
  const parent = valueAt(root, parentPath);
  if (
    !path.length ||
    parent === null ||
    Array.isArray(parent) ||
    typeof parent !== "object"
  )
    throw new Error("Only object fields can be renamed.");
  if (name !== oldName && Object.hasOwn(parent, name))
    throw new Error("A field with this name already exists.");
  return setPayloadValue(
    root,
    parentPath,
    Object.fromEntries(
      Object.entries(parent).map(([key, value]) => [
        key === oldName ? name : key,
        value,
      ]),
    ),
  );
}
export function addPayloadField(root: JsonValue, path: PayloadPath): JsonValue {
  const parent = valueAt(root, path);
  if (Array.isArray(parent))
    return setPayloadValue(root, path, [...parent, ""]);
  if (parent !== null && typeof parent === "object") {
    let name = "field",
      suffix = 1;
    while (Object.hasOwn(parent, name)) name = `field${suffix++}`;
    return setPayloadValue(
      root,
      path,
      Object.fromEntries([...Object.entries(parent), [name, ""]]),
    );
  }
  return root;
}
export function parseFormNumber(text: string): number | undefined {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text))
    return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

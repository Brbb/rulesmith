import { normalizeRouting } from "./routing";
import type { Policy } from "./types";
export type Project = { id: string; name: string };
export type WorkspaceFolder = {
  id: string;
  projectId: string;
  name: string;
  parentId?: string;
  // Accepted for compatibility with older saves; folders do not determine file types.
  kind?: "policy" | "workflow";
};
export type WorkspaceDocument = {
  id: string;
  projectId: string;
  folderId: string;
  policy: Policy;
  draft?: Policy;
  testInput?: string;
};
export type WorkspaceItem = { kind: "file" | "folder"; id: string };
export type TrashEntry = {
  id: string;
  item: WorkspaceItem;
  label: string;
  projectId: string;
  deletedAt: string;
  folders: WorkspaceFolder[];
  documents: WorkspaceDocument[];
};
export type Workspace = {
  version: 1;
  projects: Project[];
  folders: WorkspaceFolder[];
  documents: WorkspaceDocument[];
  activeDocumentId: string;
  activeProjectId?: string;
  trash?: TrashEntry[];
};
export const workspaceKey = "policy-studio-workspace-v1";
export const documentPolicy = (document: WorkspaceDocument) =>
  document.draft || document.policy;
export function createWorkspace(samples: Policy[], saved?: Policy): Workspace {
  const policies = samples.map((policy) =>
    saved?.id === policy.id ? saved : policy,
  );
  if (saved && !policies.some((policy) => policy.id === saved.id))
    policies.unshift(saved);
  const documents = policies.map((policy) => ({
    id: `local-${policy.id}`,
    projectId: "local",
    folderId: "local-workflows",
    policy: normalizeRouting(policy),
  }));
  return {
    version: 1,
    projects: [{ id: "local", name: "Local workspace" }],
    folders: [
      {
        id: "local-workflows",
        projectId: "local",
        name: "Workflows",
        kind: "workflow",
      },
    ],
    documents,
    activeDocumentId:
      documents.find((document) => document.policy.id === saved?.id)?.id ||
      documents[0]?.id ||
      "",
  };
}
export function restoreWorkspace(
  text: string | null,
  fallback: Workspace,
): Workspace {
  try {
    const value: Workspace = JSON.parse(text || "null");
    if (
      value?.version !== 1 ||
      !Array.isArray(value.projects) ||
      !Array.isArray(value.folders) ||
      !Array.isArray(value.documents) ||
      !value.projects.length
    )
      return fallback;
    if (
      [value.projects, value.folders, value.documents].some(
        (items) =>
          items.some((item) => typeof item.id !== "string" || !item.id) ||
          new Set(items.map((item) => item.id)).size !== items.length,
      )
    )
      return fallback;
    if (
      !value.projects.every(
        (project) =>
          typeof project.id === "string" && typeof project.name === "string",
      ) ||
      !value.folders.every(
        (folder) =>
          value.projects.some((project) => project.id === folder.projectId) &&
          typeof folder.name === "string" &&
          (folder.kind === undefined ||
            ["policy", "workflow"].includes(folder.kind)) &&
          (!folder.parentId ||
            value.folders.some(
              (parent) =>
                parent.id === folder.parentId &&
                parent.projectId === folder.projectId,
            )),
      ) ||
      !value.documents.every(
        (document) =>
          (document.folderId === ""
            ? value.projects.some(
                (project) => project.id === document.projectId,
              )
            : value.folders.some(
                (folder) =>
                  folder.id === document.folderId &&
                  folder.projectId === document.projectId,
              )) &&
          document.policy?.id &&
          Array.isArray(document.policy.stages) &&
          Array.isArray(document.policy.edges) &&
          (!document.draft ||
            (Array.isArray(document.draft.stages) &&
              Array.isArray(document.draft.edges))),
      )
    )
      return fallback;
    for (const folder of value.folders) {
      const seen = new Set<string>();
      let current: WorkspaceFolder | undefined = folder;
      while (current) {
        if (seen.has(current.id)) return fallback;
        seen.add(current.id);
        current = value.folders.find(
          (parent) => parent.id === current?.parentId,
        );
      }
    }
    if (
      !value.documents.some(
        (document) => document.id === value.activeDocumentId,
      )
    )
      value.activeDocumentId =
        value.documents.find(
          (document) => document.projectId === value.activeProjectId,
        )?.id ||
        (!value.activeProjectId ? value.documents[0]?.id : "") ||
        "";
    if (
      value.activeProjectId &&
      !value.projects.some((project) => project.id === value.activeProjectId)
    )
      value.activeProjectId = value.projects[0].id;
    const trash = Array.isArray(value.trash)
      ? value.trash.filter(
          (entry) =>
            entry &&
            typeof entry.id === "string" &&
            typeof entry.label === "string" &&
            typeof entry.deletedAt === "string" &&
            value.projects.some((project) => project.id === entry.projectId) &&
            entry.item &&
            ["file", "folder"].includes(entry.item.kind) &&
            typeof entry.item.id === "string" &&
            Array.isArray(entry.folders) &&
            Array.isArray(entry.documents) &&
            entry.folders.every(
              (folder) =>
                folder &&
                typeof folder.id === "string" &&
                typeof folder.name === "string" &&
                folder.projectId === entry.projectId,
            ) &&
            entry.documents.every(
              (document) =>
                document &&
                typeof document.id === "string" &&
                typeof document.folderId === "string" &&
                document.projectId === entry.projectId &&
                document.policy?.id &&
                Array.isArray(document.policy.stages) &&
                Array.isArray(document.policy.edges),
            ),
        )
      : [];
    // Consolidate only the original generated folders, preserving file identities
    // (and therefore conversations, saved tests, drafts, and audit history).
    const legacy = value.folders.filter(
      (folder) =>
        !folder.parentId &&
        folder.id === `${folder.projectId}-policies` &&
        folder.name === "Policies" &&
        value.folders.some(
          (target) =>
            target.id === `${folder.projectId}-workflows` &&
            target.name === "Workflows",
        ),
    );
    return {
      ...value,
      ...(value.trash !== undefined ? { trash } : {}),
      folders: value.folders
        .filter((folder) => !legacy.includes(folder))
        .map((folder) =>
          legacy.some((parent) => parent.id === folder.parentId)
            ? { ...folder, parentId: `${folder.projectId}-workflows` }
            : folder,
        ),
      documents: value.documents
        .map((document) =>
          legacy.some((folder) => folder.id === document.folderId)
            ? { ...document, folderId: `${document.projectId}-workflows` }
            : document,
        )
        .map((document) => ({
          ...document,
          policy: normalizeRouting(document.policy),
          ...(document.draft
            ? { draft: normalizeRouting(document.draft) }
            : {}),
        })),
    };
  } catch {
    return fallback;
  }
}
export function editDocument(
  workspace: Workspace,
  id: string,
  policy: Policy,
  save = false,
): Workspace {
  return {
    ...workspace,
    documents: workspace.documents.map((document) =>
      document.id === id
        ? save
          ? { ...document, policy, draft: undefined }
          : { ...document, draft: policy }
        : document,
    ),
  };
}
export function blankPolicy(name: string): Policy {
  return {
    version: 1,
    id: crypto.randomUUID().slice(0, 8),
    name,
    description: "",
    inputSchema: {},
    exampleInput: {},
    stages: [
      {
        id: "decision",
        name: "Decision",
        kind: "decision",
        outcome: "PASS",
        explanation: "Policy completed.",
      },
    ],
    edges: [],
  };
}

export type RoleId = "po" | "dev" | "reviewer";

export type AgentRole = {
  id: RoleId;
  name: string;
  description: string;
  systemPrompt: string;
  capabilities: readonly string[];
};

const PO_ROLE: AgentRole = {
  id: "po",
  name: "PO-agent",
  description: "Produktägare som definierar mål och prioriterar arbete",
  systemPrompt: `Du är en produktägar-agent (PO) i ett team av agenter som samarbetar mot ett gemensamt mål.

Ditt ansvar:
- Definiera och tydliggöra målet
- Prioritera arbetsuppgifter
- Godkänna när arbete är klart
- Ställa frågor för att förtydliga krav

Du kan lämna över arbete till dev-agenten för implementering, eller till gransknings-agenten för granskning.
När du behöver förtydliganden kan du ställa frågor till andra agenter.`,
  capabilities: ["definiera-mål", "prioritera", "godkänna", "fråga"],
};

const DEV_ROLE: AgentRole = {
  id: "dev",
  name: "Dev-agent",
  description: "Utvecklare som implementerar lösningar",
  systemPrompt: `Du är en utvecklar-agent (dev) i ett team av agenter som samarbetar mot ett gemensamt mål.

Ditt ansvar:
- Implementera lösningar enligt målet
- Skriva kod och dokumentation
- Rapportera när arbete är klart
- Ställa frågor om oklara krav

Du kan lämna över arbete till gransknings-agenten för granskning, eller tillbaka till PO-agenten för godkännande.
När du behöver förtydliganden kan du ställa frågor till andra agenter.`,
  capabilities: ["implementera", "dokumentera", "fråga"],
};

const REVIEWER_ROLE: AgentRole = {
  id: "reviewer",
  name: "Gransknings-agent",
  description: "Granskare som kontrollerar kvalitet och ger feedback",
  systemPrompt: `Du är en gransknings-agent (reviewer) i ett team av agenter som samarbetar mot ett gemensamt mål.

Ditt ansvar:
- Granska utfört arbete
- Kontrollera kvalitet
- Ge konstruktiv feedback
- Godkänna eller begära ändringar

Du kan lämna över arbete tillbaka till dev-agenten om ändringar behövs, eller till PO-agenten om arbetet är godkänt.
När du behöver förtydliganden kan du ställa frågor till andra agenter.`,
  capabilities: ["granska", "feedback", "godkänna", "fråga"],
};

const KNOWN_ROLES: readonly AgentRole[] = [PO_ROLE, DEV_ROLE, REVIEWER_ROLE];

export function listRoles(): readonly AgentRole[] {
  return KNOWN_ROLES;
}

export function getRole(id: RoleId): AgentRole {
  const role = KNOWN_ROLES.find((r) => r.id === id);
  if (role === undefined) {
    throw new Error(`Okänd roll: ${id}`);
  }
  return role;
}

export function getRoleByName(name: string): AgentRole | null {
  const normalizedName = name.toLowerCase().trim();
  return (
    KNOWN_ROLES.find(
      (r) =>
        r.name.toLowerCase() === normalizedName ||
        r.id === normalizedName ||
        r.description.toLowerCase().includes(normalizedName),
    ) ?? null
  );
}

export function formatRoleLabel(role: AgentRole): string {
  return `${role.name} (${role.description})`;
}

export function formatRoleList(roles: readonly AgentRole[]): string {
  return roles.map((r) => `- ${formatRoleLabel(r)}`).join("\n");
}

export function isValidRoleId(id: string): id is RoleId {
  return KNOWN_ROLES.some((r) => r.id === id);
}

const ROLE_ALIASES: Readonly<Record<string, RoleId>> = {
  "po-agent": "po",
  "produktägare": "po",
  "dev-agent": "dev",
  "utvecklare": "dev",
  "utvecklar-agent": "dev",
  "gransknings-agent": "reviewer",
  "granskare": "reviewer",
  "granskar-agent": "reviewer",
};

export function resolveRoleId(input: string): RoleId | null {
  const normalized = input.normalize("NFC").toLowerCase().trim();
  if (normalized === "") {
    return null;
  }
  if (isValidRoleId(normalized)) {
    return normalized;
  }
  return ROLE_ALIASES[normalized] ?? null;
}

export function exactRoleLabels(roleId: RoleId): readonly string[] {
  const role = getRole(roleId);
  const labels = new Set<string>([role.id, role.name.toLowerCase()]);
  for (const [alias, id] of Object.entries(ROLE_ALIASES)) {
    if (id === roleId) {
      labels.add(alias);
    }
  }
  return [...labels];
}

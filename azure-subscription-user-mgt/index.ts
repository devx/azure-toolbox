import * as pulumi from "@pulumi/pulumi";
import * as azureNative from "@pulumi/azure-native";
import * as azuread from "@pulumi/azuread";

// ---------- Helpers ----------

function pseudoGuid(input: string): string {
    const hex = Buffer.from(input).toString("hex").padEnd(32, "0").slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const builtInRoleGuids: Record<string, string> = {
    "Owner": "8e3af657-a8ff-443c-a75c-2fe8c4bcb635",
    "Contributor": "b24988ac-6180-42a0-ab88-20f7382dd24c",
    "Reader": "acdd72a7-3385-48ef-bd42-f606fba81ae7",
    // add more as needed
};

function getRoleDefinitionId(subscriptionId: string, roleName: string): string {
    const guid = builtInRoleGuids[roleName];
    if (!guid) {
        throw new Error(
            `Role '${roleName}' is not in builtInRoleGuids; add it there or implement a dynamic lookup.`,
        );
    }
    return `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${guid}`;
}

// ---------- Config Types ----------

type ScopeType = "subscription" | "resourceGroup" | "resource";

interface UserAssignmentConfig {
    roleName: string;
    scopeType?: ScopeType;        // default: subscription
    resourceGroupName?: string;   // when scopeType=resourceGroup
    scope?: string;               // full ARM scope when scopeType=resource
}

interface UserRbacConfig {
    upn: string;
    profile?: string;             // e.g. "sre", "devops", "developer"
    assignments?: UserAssignmentConfig[]; // explicit additions/overrides
    displayName?: string;         // display name for user creation
    mailNickname?: string;        // mail nickname for user creation
    password?: string;            // initial password for user creation
}

// ---------- Role Presets (Profiles) ----------
//
// Opinionated defaults. Adjust to your org’s patterns.
//
function expandProfile(
    profile: string | undefined,
    subscriptionId: string,
): UserAssignmentConfig[] {
    if (!profile) return [];

    switch (profile) {
        case "sre":
            return [
                {
                    roleName: "Reader",
                    scopeType: "subscription",
                },
                {
                    roleName: "Contributor",
                    scopeType: "resourceGroup",
                    resourceGroupName: "rg-infra",
                },
                {
                    roleName: "Contributor",
                    scopeType: "resourceGroup",
                    resourceGroupName: "rg-observability",
                },
            ];
        case "devops":
            return [
                {
                    roleName: "Contributor",
                    scopeType: "subscription",
                },
            ];
        case "developer":
            return [
                {
                    roleName: "Reader",
                    scopeType: "subscription",
                },
            ];
        case "observability":
            return [
                {
                    roleName: "Reader",
                    scopeType: "subscription",
                },
                {
                    roleName: "Reader",
                    scopeType: "resourceGroup",
                    resourceGroupName: "rg-observability",
                },
            ];
        default:
            pulumi.log.warn(`Unknown RBAC profile '${profile}', no preset assignments will be applied.`);
            return [];
    }
}

// Merge preset + explicit assignments
// Simple strategy: presets first, then user assignments appended.
// If you want de-duplication or override semantics, you can add that here.
function mergeAssignments(
    presetAssignments: UserAssignmentConfig[],
    explicitAssignments: UserAssignmentConfig[] | undefined,
): UserAssignmentConfig[] {
    return [...presetAssignments, ...(explicitAssignments || [])];
}

// ---------- Read Config ----------

const azureConfig = new pulumi.Config("azure");
const rbacConfig = new pulumi.Config("rbac");
const subscriptionId = azureConfig.require("subscriptionId");
const usersConfig = (rbacConfig.getObject<UserRbacConfig[]>("users") || []) as UserRbacConfig[];

const subscriptionScope = `/subscriptions/${subscriptionId}`;

// ---------- Main Logic ----------

const allAssignments: pulumi.Output<any>[] = [];

for (const user of usersConfig) {
    const { upn, profile } = user;

    // Expand profile to base assignments
    const presetAssignments = expandProfile(profile, subscriptionId);

    // Merge preset + explicit
    const assignments = mergeAssignments(presetAssignments, user.assignments);

    if (!assignments || assignments.length === 0) {
        pulumi.log.warn(`User '${upn}' has no assignments after profile + explicit merge; skipping.`);
        continue;
    }

    // 1) Get or create user
    // First try to look up existing user, if not found create new one
    let principalId: pulumi.Output<string>;
    
    const displayName = user.displayName || upn.split('@')[0];
    const mailNickname = user.mailNickname || upn.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    const password = user.password || `TempPass${Math.random().toString(36).slice(2)}!`;

    // Try to get existing user
    const existingUser = pulumi.output(azuread.getUser({
        userPrincipalName: upn,
    }, { async: true }).catch(() => undefined));

    principalId = existingUser.apply(existing => {
        if (existing) {
            // User exists, use existing ID (extract GUID from path if needed)
            pulumi.log.info(`Using existing user: ${upn}`);
            const id = existing.id.includes('/') ? existing.id.split('/').pop()! : existing.id;
            return pulumi.output(id);
        } else {
            // User doesn't exist, create new one
            const newUser = new azuread.User(
                `user-${upn.replace(/[@.]/g, "-")}`,
                {
                    userPrincipalName: upn,
                    displayName: displayName,
                    mailNickname: mailNickname,
                    password: password,
                    accountEnabled: true,
                },
                {
                    ignoreChanges: ["password"],
                }
            );
            pulumi.log.info(`Creating new user: ${upn}`);
            return newUser.id;
        }
    });

    for (const assignment of assignments) {
        const scopeType: ScopeType = assignment.scopeType || "subscription";

        // 2) Determine scope
        let scope: string;
        if (scopeType === "subscription") {
            scope = subscriptionScope;
        } else if (scopeType === "resourceGroup") {
            if (!assignment.resourceGroupName) {
                throw new Error(
                    `User '${upn}' assignment with role '${assignment.roleName}' has scopeType 'resourceGroup' but no resourceGroupName.`,
                );
            }
            scope = `/subscriptions/${subscriptionId}/resourceGroups/${assignment.resourceGroupName}`;
        } else { // "resource"
            if (!assignment.scope) {
                throw new Error(
                    `User '${upn}' assignment with role '${assignment.roleName}' has scopeType 'resource' but no 'scope' (full ARM ID).`,
                );
            }
            scope = assignment.scope;
        }

        // 3) Role definition ID
        const roleDefinitionId = getRoleDefinitionId(subscriptionId, assignment.roleName);

        // 4) Stable roleAssignmentName (GUID)
        const roleAssignmentName = principalId.apply((pid) => {
            const key = `${pid}|${roleDefinitionId}|${scope}`;
            return pseudoGuid(key);
        });

        // 5) Logical name (Pulumi resource name)
        const logicalName = [
            "rbac",
            upn.replace(/[@.]/g, "-"),
            assignment.roleName.toLowerCase(),
            scopeType,
            assignment.resourceGroupName,
        ]
            .filter(Boolean)
            .join("-");

        const roleAssignment = new azureNative.authorization.RoleAssignment(
            logicalName,
            {
                principalId: principalId,
                principalType: "User",
                roleDefinitionId: roleDefinitionId,
                scope: scope,
                roleAssignmentName: roleAssignmentName,
            },
        );

        allAssignments.push(roleAssignment.id);
    }
}

export const managedRbac = usersConfig.map((u) => ({
    upn: u.upn,
    profile: u.profile || null,
    assignments: mergeAssignments(
        expandProfile(u.profile, subscriptionId),
        u.assignments,
    ),
}));


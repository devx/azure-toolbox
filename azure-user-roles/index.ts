import * as pulumi from "@pulumi/pulumi";
import * as azuread from "@pulumi/azuread";

// ---------- Configuration ----------

const config = new pulumi.Config();

const appName = config.get("appName") || "Keycloak-IdP-Integration";
const redirectUri = config.get("redirectUri"); // Optional
const secretLifetime = config.get("secretLifetime") || "17520h"; // 2 years in hours

// Required security groups for Kubernetes RBAC
const requiredGroups = [
    "cluster-admins",
    "read-only",
    "namespace-admins",
    "security-team",
    "observability",
    "platform-team",
    "k8s-ops",
];

// ---------- Get Current Tenant ----------

const currentClient = azuread.getClientConfigOutput({});
const tenantId = currentClient.tenantId;

// ---------- Application Registration ----------

const app = new azuread.Application("keycloak-app", {
    displayName: appName,
    signInAudience: "AzureADMyOrg", // Single tenant
    web: redirectUri
        ? {
              redirectUris: [redirectUri],
          }
        : {
              redirectUris: [],
          },
    requiredResourceAccesses: [
        {
            // Microsoft Graph API
            resourceAppId: "00000003-0000-0000-c000-000000000000",
            resourceAccesses: [
                {
                    // User.Read (Delegated)
                    id: "e1fe6dd8-ba31-4d61-89e7-88639da4683d",
                    type: "Scope",
                },
                {
                    // Group.Read.All (Application)
                    id: "5b567255-7703-4780-807c-7be8301ae99b",
                    type: "Role",
                },
            ],
        },
    ],
});

// ---------- Service Principal ----------

const servicePrincipal = new azuread.ServicePrincipal("keycloak-sp", {
    clientId: app.clientId,
});

// ---------- Client Secret ----------

const clientSecret = new azuread.ApplicationPassword("keycloak-secret", {
    applicationId: app.id,
    displayName: "Keycloak Secret",
    endDate: pulumi.interpolate`${new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString()}`,
});

// ---------- Security Groups ----------

const groups: Record<string, azuread.Group> = {};
const groupIds: Record<string, pulumi.Output<string>> = {};

for (const groupName of requiredGroups) {
    const group = new azuread.Group(`group-${groupName}`, {
        displayName: groupName,
        securityEnabled: true,
        mailEnabled: false,
    });

    groups[groupName] = group;
    groupIds[groupName] = group.objectId;
}

// ---------- Outputs ----------

export const clientId = app.clientId;
export const applicationTenantId = tenantId;
export const clientSecretValue = pulumi.secret(clientSecret.value);
export const oidcDiscoveryUrl = pulumi.interpolate`https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`;
export const securityGroupIds = pulumi.output(groupIds);

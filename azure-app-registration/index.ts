import * as pulumi from "@pulumi/pulumi";
import * as azuread from "@pulumi/azuread";

// Configuration
const config = new pulumi.Config();
const appName = config.get("appName") || "openCenter-idp-integration";
const redirectUri = config.get("redirectUri");
const secretLifetime = config.get("secretLifetime") || "2 years";

// Get current Azure AD client configuration for tenant ID
const current = azuread.getClientConfigOutput();

// Microsoft Graph API ID (well-known)
const MICROSOFT_GRAPH_APP_ID = "00000003-0000-0000-c000-000000000000";

// Create the Application Registration
const app = new azuread.Application("keycloak-app", {
    displayName: appName,
    signInAudience: "AzureADMyOrg", // Single tenant
    web: {
        redirectUris: redirectUri ? [redirectUri] : [], // Configure with Keycloak URL or leave empty
    },
    groupMembershipClaims: ["SecurityGroup"], // Include security groups in tokens
    requiredResourceAccesses: [
        {
            // Microsoft Graph API permissions
            resourceAppId: MICROSOFT_GRAPH_APP_ID,
            resourceAccesses: [
                {
                    // User.Read (Delegated)
                    id: "e1fe6dd8-ba31-4d61-89e7-88639da4683d",
                    type: "Scope",
                },
                {
                    // Group.Read.All (Delegated)
                    id: "5f8c59db-677d-491f-a6b8-5f174b11ec1d",
                    type: "Scope",
                },
            ],
        },
    ],
});

// Create Service Principal for the application
const servicePrincipal = new azuread.ServicePrincipal("keycloak-sp", {
    clientId: app.clientId,
});

// Create Client Secret
const appPassword = new azuread.ApplicationPassword("keycloak-secret", {
    applicationId: app.id,
    displayName: "Keycloak Secret",
    endDate: pulumi.interpolate`${getEndDate(secretLifetime)}`,
});

// Helper function to calculate end date
function getEndDate(duration: string): string {
    const now = new Date();
    
    // Parse duration (e.g., "2 years")
    const match = duration.match(/(\d+)\s*(year|month|day)s?/i);
    if (match) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        switch (unit) {
            case "year":
                now.setFullYear(now.getFullYear() + value);
                break;
            case "month":
                now.setMonth(now.getMonth() + value);
                break;
            case "day":
                now.setDate(now.getDate() + value);
                break;
        }
    }
    
    return now.toISOString();
}

// Create Security Groups for RBAC
const groupNames = [
    "cluster-admins",
    "read-only",
    "namespace-admins",
    "security-team",
    "observability",
    "platform-team",
    "k8s-ops",
];

const groups: Record<string, azuread.Group> = {};
const groupIds: Record<string, pulumi.Output<string>> = {};

for (const groupName of groupNames) {
    const group = new azuread.Group(`group-${groupName}`, {
        displayName: groupName,
        securityEnabled: true,
        mailEnabled: false,
    });
    
    groups[groupName] = group;
    groupIds[groupName] = group.objectId;
}

// Exports - Required outputs for Keycloak configuration
export const clientId = app.clientId;
export const tenantId = current.tenantId;
export const clientSecret = pulumi.secret(appPassword.value);
export const oidcDiscoveryUrl = pulumi.interpolate`https://login.microsoftonline.com/${current.tenantId}/v2.0/.well-known/openid-configuration`;
export const groupIdMap = pulumi.output(groupIds);

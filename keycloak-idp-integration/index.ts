import * as pulumi from "@pulumi/pulumi";
import * as keycloak from "@pulumi/keycloak";

// Load configuration
const config = new pulumi.Config();
const realmId = config.require("realmId");
const keycloakBaseUrl = config.require("keycloakBaseUrl");
const azureClientId = config.require("azureClientId");
const azureClientSecret = config.requireSecret("azureClientSecret");
const azureTenantId = config.require("azureTenantId");

// Construct Microsoft OIDC endpoints dynamically
const authorizationUrl = `https://login.microsoftonline.com/${azureTenantId}/oauth2/v2.0/authorize`;
const tokenUrl = `https://login.microsoftonline.com/${azureTenantId}/oauth2/v2.0/token`;
const userInfoUrl = "https://graph.microsoft.com/oidc/userinfo";
const issuer = `https://login.microsoftonline.com/${azureTenantId}/v2.0`;

// Create the Microsoft Entra ID Identity Provider
const microsoftIdp = new keycloak.oidc.IdentityProvider("microsoft-entra", {
    realm: realmId,
    alias: "microsoft-entra",
    displayName: "Login with Microsoft",
    clientId: azureClientId,
    clientSecret: azureClientSecret,
    authorizationUrl: authorizationUrl,
    tokenUrl: tokenUrl,
    userInfoUrl: userInfoUrl,
    issuer: issuer,
    defaultScopes: "openid profile email",
    storeToken: false,
    addReadTokenRoleOnCreate: false,
    trustEmail: true,
});

// Create attribute mapper for Name (first name)
const nameMapper = new keycloak.AttributeImporterIdentityProviderMapper("name-mapper", {
    realm: realmId,
    identityProviderAlias: microsoftIdp.alias,
    name: "Import Name",
    claimName: "name",
    userAttribute: "firstName",
});

// Create attribute mapper for Email
const emailMapper = new keycloak.AttributeImporterIdentityProviderMapper("email-mapper", {
    realm: realmId,
    identityProviderAlias: microsoftIdp.alias,
    name: "Import Email",
    claimName: "email",
    userAttribute: "email",
});

// Create attribute mapper for Surname (last name)
const surnameMapper = new keycloak.AttributeImporterIdentityProviderMapper("surname-mapper", {
    realm: realmId,
    identityProviderAlias: microsoftIdp.alias,
    name: "Import Surname",
    claimName: "family_name",
    userAttribute: "lastName",
});

// Construct and export the Redirect URI for Azure AD configuration
const keycloakRedirectUri = `${keycloakBaseUrl}/realms/${realmId}/broker/microsoft-entra/endpoint`;

export const redirectUri = keycloakRedirectUri;
export const identityProviderAlias = microsoftIdp.alias;

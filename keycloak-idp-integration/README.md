# Keycloak Azure AD Integration with Pulumi

This Pulumi TypeScript project configures Keycloak to integrate with Azure AD (Microsoft Entra ID) as an OIDC identity provider.

## Prerequisites

- Node.js and npm installed
- Pulumi CLI installed
- Access to a Keycloak instance
- Azure AD credentials (from Phase 1)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your stack (edit `Pulumi.keycloak.yaml` or use CLI):
```bash
# Keycloak Provider Configuration
pulumi config set keycloak:url "https://auth.example.com"
pulumi config set keycloak:clientId "admin-cli"
pulumi config set keycloak:username "admin"
pulumi config set --secret keycloak:password "your-keycloak-admin-password"

# Application Configuration
pulumi config set realmId "my-realm"
pulumi config set keycloakBaseUrl "https://auth.example.com"
pulumi config set azureClientId "your-azure-client-id"
pulumi config set --secret azureClientSecret "your-azure-client-secret"
pulumi config set azureTenantId "your-azure-tenant-id"
```

## Configuration Parameters

### Keycloak Provider Configuration
- `keycloak:url`: Base URL of your Keycloak instance (before `/auth`)
- `keycloak:clientId`: Keycloak client ID (typically `admin-cli`)
- `keycloak:username`: Keycloak admin username
- `keycloak:password`: Keycloak admin password (stored as secret)

### Application Configuration
- `realmId`: The Keycloak realm ID where the provider will be added
- `keycloakBaseUrl`: Base URL of your Keycloak instance
- `azureClientId`: Application (client) ID from Azure AD
- `azureClientSecret`: Client secret from Azure AD (stored as secret)
- `azureTenantId`: Directory (tenant) ID from Azure AD

## Deploy

```bash
pulumi up
```

## Outputs

After deployment, the stack exports:

- `redirectUri`: The redirect URI to configure in Azure AD (Phase 3)
- `identityProviderAlias`: The alias of the created identity provider

## What Gets Created

1. **Identity Provider**: Microsoft Entra ID OIDC provider with:
   - Alias: `microsoft-entra`
   - Display name: "Login with Microsoft"
   - Configured endpoints for Azure AD
   - Email scope included for proper attribute mapping
   - Trust email enabled

2. **Attribute Mappers**:
   - Name mapper: Maps `name` claim to `firstName` attribute
   - Email mapper: Maps `email` claim to `email` attribute
   - Surname mapper: Maps `family_name` claim to `lastName` attribute

## Next Steps

Copy the `redirectUri` output and add it to your Azure AD app registration's redirect URIs (Phase 3).

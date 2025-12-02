# Microsoft Entra ID Application Registration with Pulumi

This Pulumi TypeScript script automates the complete Entra ID configuration for Keycloak IdP integration, including:
- **Phase 1**: Application Registration with single-tenant configuration
- **Phase 3**: API Permissions, Service Principal, and Security Groups for RBAC

## Prerequisites

- Node.js and npm installed
- Pulumi CLI installed
- Azure CLI authenticated (`az login`)
- Appropriate permissions in Azure AD to:
  - Create applications
  - Create service principals
  - Create security groups
  - Grant API permissions

## Quick Start

1. **Install dependencies**:
```bash
npm install
```

2. **Initialize Pulumi stack** (if not already done):
```bash
pulumi stack init <stack-name>
```

3. **Deploy the infrastructure**:
```bash
PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi up
```

## Configuration

Optional configuration values (with defaults):

```bash
# Customize application name (default: "openCenter-idp-integration")
pulumi config set appName "YourCustomAppName"

# Set client secret lifetime (default: "2 years")
pulumi config set secretLifetime "2 years"

# Add redirect URI once Keycloak is configured
pulumi config set redirectUri "https://your-keycloak-url/auth/realms/your-realm/broker/azuread/endpoint"
```

## Resources Created

This script provisions the following Azure AD resources:

### 1. Application Registration
- **Display Name**: openCenter-idp-integration (configurable)
- **Sign-in Audience**: Single Tenant (AzureADMyOrg)
- **Redirect URIs**: Empty by default, configurable via `redirectUri` config

### 2. Service Principal
- Linked to the application for enterprise integration

### 3. Client Secret
- **Display Name**: Keycloak Secret
- **Lifetime**: 2 years (configurable)
- **Output**: Marked as sensitive/secret

### 4. API Permissions (Microsoft Graph)
- **User.Read** (Delegated) - Read user profile data
- **Group.Read.All** (Delegated) - Read group memberships for RBAC

### 5. Security Groups for RBAC
Seven security groups are created for Kubernetes role mapping:
- `cluster-admins` - Full cluster administration
- `read-only` - Read-only access across namespaces
- `namespace-admins` - Namespace-level administration
- `security-team` - Security operations and auditing
- `observability` - Monitoring and logging access
- `platform-team` - Platform engineering and infrastructure
- `k8s-ops` - Kubernetes operations and maintenance

## Outputs

After deployment, the following values are exported:

| Output | Description | Command to View |
|--------|-------------|-----------------|
| `clientId` | Application (client) ID | `pulumi stack output clientId` |
| `tenantId` | Directory (tenant) ID | `pulumi stack output tenantId` |
| `clientSecret` | Client secret value (sensitive) | `pulumi stack output clientSecret --show-secrets` |
| `oidcDiscoveryUrl` | OIDC discovery endpoint | `pulumi stack output oidcDiscoveryUrl` |
| `groupIdMap` | Group names to Object IDs mapping | `pulumi stack output groupIdMap` |

### View All Outputs

```bash
# View all non-sensitive outputs
PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi stack output

# View sensitive outputs (client secret)
PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi stack output clientSecret --show-secrets

# View group ID mappings
PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi stack output groupIdMap

# Export all outputs as JSON
PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi stack output --json
```

## Post-Deployment Steps

### 1. Grant Admin Consent for API Permissions

After deployment, an Azure AD administrator must grant admin consent:

1. Navigate to **Azure Portal** → **Azure Active Directory** → **App registrations**
2. Find and select **openCenter-idp-integration**
3. Go to **API permissions**
4. Click **Grant admin consent for [Your Organization]**
5. Confirm the consent

### 2. Configure Keycloak Identity Provider

Use the exported values to configure Keycloak:

```bash
# Get the required values
CLIENT_ID=$(PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi stack output clientId)
TENANT_ID=$(PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi stack output tenantId)
CLIENT_SECRET=$(PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi stack output clientSecret --show-secrets)
OIDC_URL=$(PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi stack output oidcDiscoveryUrl)
```

In Keycloak:
1. Navigate to **Identity Providers** → **Add provider** → **OpenID Connect v1.0**
2. Configure with the values above:
   - **Client ID**: Use `$CLIENT_ID`
   - **Client Secret**: Use `$CLIENT_SECRET`
   - **Discovery Endpoint**: Use `$OIDC_URL`
3. Save and note the **Redirect URI** provided by Keycloak

### 3. Update Redirect URI

Once you have the Keycloak redirect URI:

```bash
pulumi config set redirectUri "https://your-keycloak-url/auth/realms/your-realm/broker/azuread/endpoint"
PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi up
```

### 4. Configure Group-to-Role Mappings

Use the `groupIdMap` output to map Azure AD groups to Kubernetes roles:

```bash
# View all group IDs
PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi stack output groupIdMap
```

Example output:
```json
{
  "cluster-admins": "b41222d9-7bdc-4666-9334-88d02780d8f1",
  "k8s-ops": "cde4afbb-9272-4a19-b31f-fb132c015b0f",
  "namespace-admins": "8dad023a-fb43-4e79-b8b7-4c6f9de46c32",
  "observability": "27ce3234-5507-4bca-a3f2-bba2e92a32e5",
  "platform-team": "9ae5b5b4-48cb-41f4-b2d5-94733a85337b",
  "read-only": "f0e55c8e-4f26-483a-8089-4a0d1c5cfed0",
  "security-team": "35e5ec53-395c-4855-9585-7283209b4648"
}
```

Use these Object IDs in your Keycloak mappers or Kubernetes RBAC configurations.

## Cleanup

To destroy all created resources:

```bash
PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi destroy
```

## Troubleshooting

### Authentication Issues
If you encounter authentication errors, ensure you're logged in to Azure:
```bash
az login
az account show
```

### Permission Errors
Ensure your Azure AD account has sufficient permissions to:
- Create applications and service principals
- Create security groups
- Grant API permissions (requires Global Administrator or Privileged Role Administrator)

### Passphrase Issues
If you get passphrase errors, ensure the passphrase file exists and is readable:
```bash
cat ~/.pulumi/palmahq.txt
```

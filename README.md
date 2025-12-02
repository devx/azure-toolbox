# Azure AD & Keycloak Integration with Pulumi

This repository contains Pulumi infrastructure-as-code projects for setting up Azure AD (Microsoft Entra ID) integration with Keycloak for enterprise authentication and RBAC.

## Overview

This repository provides three complementary Pulumi projects that work together to establish a complete identity provider integration:

1. **azure-app-registration** - Creates and configures Azure AD application registration with RBAC security groups
2. **keycloak-idp-integration** - Configures Keycloak to use Azure AD as an OIDC identity provider
3. **azure-user-roles** - Template for managing Azure user roles and permissions

## Projects

### 1. Azure App Registration (`azure-app-registration/`)

Automates the complete Azure AD configuration for Keycloak IdP integration, including:
- Application registration with single-tenant configuration
- Service principal creation
- Client secret generation
- API permissions (User.Read, Group.Read.All)
- Seven RBAC security groups for Kubernetes role mapping

**Key Outputs:**
- Client ID, Tenant ID, Client Secret
- OIDC discovery URL
- Security group Object IDs for RBAC

[View detailed documentation →](azure-app-registration/README.md)

### 2. Keycloak IdP Integration (`keycloak-idp-integration/`)

Configures Keycloak to integrate with Azure AD as an OIDC identity provider:
- Identity provider setup with Microsoft Entra ID
- Attribute mappers for user claims (name, email, surname)
- Automatic redirect URI generation

**Key Outputs:**
- Redirect URI for Azure AD configuration
- Identity provider alias

[View detailed documentation →](keycloak-idp-integration/README.md)

### 3. Azure User Roles (`azure-user-roles/`)

A template project for managing Azure resources and user roles using Pulumi's Azure Native provider.

[View detailed documentation →](azure-user-roles/README.md)

## Quick Start

### Prerequisites

- Node.js (LTS) and npm
- Pulumi CLI installed and configured
- Azure CLI authenticated (`az login`)
- Access to Keycloak instance
- Appropriate Azure AD permissions:
  - Create applications and service principals
  - Create security groups
  - Grant API permissions

### Deployment Order

Follow these steps to set up the complete integration:

#### Step 1: Deploy Azure App Registration

```bash
cd azure-app-registration
npm install
pulumi stack init <stack-name>
PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi up
```

Save the outputs (clientId, tenantId, clientSecret, oidcDiscoveryUrl).

#### Step 2: Grant Admin Consent

In Azure Portal:
1. Navigate to Azure Active Directory → App registrations
2. Select your application
3. Go to API permissions
4. Click "Grant admin consent"

#### Step 3: Deploy Keycloak Integration

```bash
cd ../keycloak-idp-integration
npm install
pulumi config set keycloak:url "https://auth.example.com"
pulumi config set keycloak:clientId "admin-cli"
pulumi config set keycloak:username "admin"
pulumi config set --secret keycloak:password "your-password"
pulumi config set azureClientId "<from-step-1>"
pulumi config set --secret azureClientSecret "<from-step-1>"
pulumi config set azureTenantId "<from-step-1>"
pulumi up
```

#### Step 4: Update Azure Redirect URI

Copy the `redirectUri` output from Step 3 and update your Azure app:

```bash
cd ../azure-app-registration
pulumi config set redirectUri "<redirect-uri-from-step-3>"
pulumi up
```

## Security Groups for RBAC

The Azure app registration creates seven security groups for Kubernetes role mapping:

| Group Name | Purpose |
|------------|---------|
| `cluster-admins` | Full cluster administration |
| `read-only` | Read-only access across namespaces |
| `namespace-admins` | Namespace-level administration |
| `security-team` | Security operations and auditing |
| `observability` | Monitoring and logging access |
| `platform-team` | Platform engineering and infrastructure |
| `k8s-ops` | Kubernetes operations and maintenance |

Retrieve group Object IDs for RBAC configuration:

```bash
cd azure-app-registration
PULUMI_CONFIG_PASSPHRASE_FILE=~/.pulumi/palmahq.txt pulumi stack output groupIdMap
```

## Common Commands

### View Stack Outputs

```bash
# Non-sensitive outputs
pulumi stack output

# Sensitive outputs (secrets)
pulumi stack output clientSecret --show-secrets

# All outputs as JSON
pulumi stack output --json
```

### Update Configuration

```bash
pulumi config set <key> <value>
pulumi config set --secret <key> <secret-value>
```

### Cleanup

```bash
# Destroy resources in reverse order
cd keycloak-idp-integration
pulumi destroy

cd ../azure-app-registration
pulumi destroy
```

## Troubleshooting

### Authentication Issues
Ensure you're logged in to Azure:
```bash
az login
az account show
```

### Permission Errors
Verify your Azure AD account has:
- Application.ReadWrite.All
- Group.ReadWrite.All
- RoleManagement.ReadWrite.Directory

### Keycloak Connection Issues
Verify Keycloak URL and credentials:
```bash
curl -X POST "https://auth.example.com/auth/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=your-password" \
  -d "grant_type=password"
```

## Contributing

Each project contains its own detailed README with specific configuration options and troubleshooting steps. Refer to individual project documentation for more details.

## License

[Add your license information here]

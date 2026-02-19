import { red, cyan } from "./colors.ts";

/** Structured error with actionable hint */
export interface ParsedError {
  message: string;
  hint?: string;
  shouldRetry?: boolean;
}

/**
 * Parse gcloud CLI errors and provide actionable hints
 */
export function parseGcpError(stderr: string): ParsedError {
  const lower = stderr.toLowerCase();

  // Authentication errors
  if (lower.includes("reauthentication failed") ||
      lower.includes("there was a problem refreshing your current auth tokens") ||
      lower.includes("invalid credentials") ||
      lower.includes("token expired")) {
    return {
      message: "GCP authentication failed or expired",
      hint: "Run: gcloud auth login\nOr for service account: gcloud auth activate-service-account --key-file=KEY_FILE",
      shouldRetry: true,
    };
  }

  // Permission denied
  if (lower.includes("permission denied") || lower.includes("insufficient permissions")) {
    return {
      message: "Insufficient GCP permissions",
      hint: "Your account lacks required permissions. Ask your admin to add appropriate roles (e.g., 'roles/container.clusterViewer' for read, 'roles/container.clusterAdmin' for full access).",
    };
  }

  // Project not found
  if (lower.includes("not found") && (lower.includes("project") || lower.includes("cluster"))) {
    return {
      message: "Project or cluster not found",
      hint: "Verify the project ID and cluster name are correct. Run: gcloud projects list",
    };
  }

  // Region/zone not found
  if (lower.includes("not found") && (lower.includes("region") || lower.includes("zone"))) {
    return {
      message: "Region or zone not found",
      hint: "Verify the region/zone exists. Run: gcloud compute regions list",
    };
  }

  // Default - return original
  return {
    message: extractFirstLine(stderr),
    hint: undefined,
  };
}

/**
 * Parse AWS CLI errors and provide actionable hints
 */
export function parseAwsError(stderr: string): ParsedError {
  const lower = stderr.toLowerCase();

  // SSO session expired
  if (lower.includes("the sso session associated with this profile has expired") ||
      lower.includes("sso session has expired") ||
      lower.includes("error validating provider")) {
    return {
      message: "AWS SSO session expired",
      hint: "Run: aws sso login --profile PROFILE_NAME",
      shouldRetry: true,
    };
  }

  // Invalid profile
  if (lower.includes("profile") && lower.includes("does not exist")) {
    return {
      message: "AWS profile not found",
      hint: "Check your AWS config: ~/.aws/config",
    };
  }

  // Access denied
  if (lower.includes("access denied") || lower.includes("unauthorized")) {
    return {
      message: "AWS access denied",
      hint: "Verify your IAM permissions include eks:DescribeCluster and eks:AccessKubernetesApi",
    };
  }

  // Cluster not found
  if (lower.includes("not found") && lower.includes("cluster")) {
    return {
      message: "EKS cluster not found",
      hint: "Verify cluster name and region. Run: aws eks list-clusters --region REGION",
    };
  }

  // Default
  return {
    message: extractFirstLine(stderr),
    hint: undefined,
  };
}

/**
 * Parse Azure CLI errors and provide actionable hints
 */
export function parseAzureError(stderr: string): ParsedError {
  const lower = stderr.toLowerCase();

  // Not logged in
  if (lower.includes("please run") && lower.includes("az login")) {
    return {
      message: "Azure not authenticated",
      hint: "Run: az login",
      shouldRetry: true,
    };
  }

  // Subscription issues
  if (lower.includes("subscription") && (lower.includes("not found") || lower.includes("not exist"))) {
    return {
      message: "Azure subscription not found",
      hint: "Verify your subscription. Run: az account list",
    };
  }

  // Permission denied
  if (lower.includes("permission denied") || lower.includes("authorization failed")) {
    return {
      message: "Azure permission denied",
      hint: "Your account lacks required Azure RBAC permissions. Ask admin to add 'Azure Kubernetes Service Cluster User Role'.",
    };
  }

  // Cluster not found
  if (lower.includes("not found") && lower.includes("cluster")) {
    return {
      message: "AKS cluster not found",
      hint: "Verify cluster name and resource group. Run: az aks list",
    };
  }

  // Default
  return {
    message: extractFirstLine(stderr),
    hint: undefined,
  };
}

/**
 * Print a parsed error with optional hint
 */
export function printError(error: ParsedError): void {
  console.error(red(`❌ ${error.message}`));
  if (error.hint) {
    console.error(cyan(`💡 Hint: ${error.hint}`));
  }
}

/**
 * Extract the first line from a multi-line error message
 */
function extractFirstLine(stderr: string): string {
  const lines = stderr.trim().split("\n");
  return lines[0] || "Unknown error";
}

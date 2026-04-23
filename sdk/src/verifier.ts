/**
 * @module verifier
 * @description This module provides the Verifier SDK for the canton-did-credentials project.
 * It offers functionalities to verify W3C Verifiable Presentations, with a specific focus
 * on checking the on-ledger revocation status of credentials against a Canton network.
 *
 * The primary function, `verify`, orchestrates the verification process, which includes:
 * 1. Basic structural validation of the presentation.
 * 2. Cryptographic verification of signatures (placeholder for a real crypto library).
 * 3. On-ledger revocation checks via the Canton JSON API.
 * 4. Expiration checks.
 *
 * This SDK is designed to be used by applications acting as Verifiers in the
 * self-sovereign identity ecosystem.
 */

// For non-browser environments (e.g., Node.js), a fetch polyfill is required.
// You can install it with `npm install node-fetch`.
// import fetch from 'node-fetch';

/**
 * Configuration for connecting to a Canton ledger's JSON API.
 */
export interface LedgerConfig {
  /** The acting party ID of the Verifier. */
  party: string;
  /** A valid JWT for authenticating with the JSON API. */
  token: string;
  /** The base URL of the JSON API, e.g., 'http://localhost:7575'. */
  httpBaseUrl: string;
}

/**
 * The result of a verification process.
 */
export interface VerificationResult {
  /** A boolean indicating if the presentation is valid in its entirety. */
  verified: boolean;
  /** An array of error messages detailing any verification failures. */
  errors: string[];
}

/**
 * A simplified representation of a W3C Verifiable Credential.
 * @see https://www.w3.org/TR/vc-data-model/
 */
export interface VerifiableCredential {
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: Record<string, any>;
  proof: Record<string, any>;
  [key: string]: any;
}

/**
 * A simplified representation of a W3C Verifiable Presentation.
 * @see https://www.w3.org/TR/vc-data-model/#presentations
 */
export interface VerifiablePresentation {
  '@context': string[];
  id?: string;
  type: string[];
  verifiableCredential: VerifiableCredential[];
  holder: string;
  proof: Record<string, any>;
  [key: string]: any;
}

/**
 * Options to configure the verification process.
 */
export interface VerificationOptions {
  /** If true, the verifier will check the on-ledger revocation registry. Defaults to true. */
  checkRevocation: boolean;
}

/**
 * Represents the structure of a Daml revocation registry contract as returned by the JSON API.
 */
interface DamlRevocationContract {
  contractId: string;
  templateId: string; // e.g., "b19...:Revocation.RevocationRegistry:RegistryEntry"
  payload: {
    issuer: string; // Daml Party
    credentialId: string;
    reason: string | null; // Daml's `Optional Text`
  };
}

/**
 * Checks the on-ledger revocation status of a single credential.
 * It queries the Canton ledger for a `Revocation.RevocationRegistry:RegistryEntry` contract
 * corresponding to the given credential ID.
 *
 * @param credential - The credential to check.
 * @param config - The ledger connection configuration.
 * @returns An object indicating if the credential has been revoked and the reason, if any.
 */
async function checkRevocationStatus(
  credential: VerifiableCredential,
  config: LedgerConfig
): Promise<{ revoked: boolean; reason?: string }> {
  // This template ID is defined in the Daml models. It should be consistent
  // with the package ID and module/template names of your compiled DAR.
  const revocationTemplateId = "Revocation.RevocationRegistry:RegistryEntry";

  const queryPayload = {
    templateIds: [revocationTemplateId],
    query: {
      credentialId: credential.id,
    },
  };

  const response = await fetch(`${config.httpBaseUrl}/v1/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(queryPayload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to query revocation registry: ${response.status} ${errorBody}`);
  }

  const jsonResponse: { result: DamlRevocationContract[] } = await response.json();
  const activeContracts = jsonResponse.result;

  if (activeContracts && activeContracts.length > 0) {
    const revocationReason = activeContracts[0]?.payload?.reason;
    return { revoked: true, reason: revocationReason || "No reason provided" };
  }

  return { revoked: false };
}

/**
 * Verifies the cryptographic signature of a credential or presentation.
 *
 * @remarks
 * This is a placeholder function. A production implementation would use a library
 * like `did-jwt` or `vc-js` to perform DID resolution and JWS verification.
 *
 * The steps would be:
 * 1. Parse the `proof` object to get the verification method (a DID URL).
 * 2. Resolve the DID to get the full DID Document.
 * 3. Find the public key corresponding to the verification method.
 * 4. Verify the JWS signature against the payload of the VC/VP.
 *
 * @param data - The Verifiable Credential or Presentation with a `proof` object.
 * @returns A promise that resolves to true if the signature is valid.
 */
async function verifySignature(data: VerifiableCredential | VerifiablePresentation): Promise<boolean> {
  // In a real-world scenario, you would integrate a crypto library here.
  // For the purpose of this SDK example, we assume signatures are valid.
  if (!data.proof) return false;
  return true;
}

/**
 * Verifies a Verifiable Presentation against the Canton ledger and W3C standards.
 *
 * This function performs a comprehensive check, including signature verification,
 * on-ledger revocation status, and credential expiration.
 *
 * @param presentation - The Verifiable Presentation to verify.
 * @param config - Ledger connection configuration for the Verifier.
 * @param options - Optional parameters to customize the verification process.
 * @returns A `VerificationResult` object.
 */
export async function verify(
  presentation: VerifiablePresentation,
  config: LedgerConfig,
  options: VerificationOptions = { checkRevocation: true }
): Promise<VerificationResult> {
  const errors: string[] = [];

  // 1. Basic structural validation of the presentation
  if (!presentation.type?.includes("VerifiablePresentation")) {
    errors.push("Object is not a Verifiable Presentation.");
  }
  if (!presentation.verifiableCredential || presentation.verifiableCredential.length === 0) {
    errors.push("Presentation contains no verifiable credentials.");
  }
  if (!presentation.proof) {
    errors.push("Presentation is not signed (missing proof).");
  }

  if (errors.length > 0) {
    return { verified: false, errors };
  }

  // 2. Verify the presentation's signature
  const presentationSignatureValid = await verifySignature(presentation);
  if (!presentationSignatureValid) {
    errors.push("Presentation signature is invalid.");
  }

  // 3. Verify each credential within the presentation
  for (const vc of presentation.verifiableCredential) {
    // 3a. Verify credential signature
    const credentialSignatureValid = await verifySignature(vc);
    if (!credentialSignatureValid) {
      errors.push(`Signature on credential '${vc.id}' is invalid.`);
      continue; // Skip further checks for this invalid credential
    }

    // 3b. Check for credential expiration
    if (vc.expirationDate && new Date(vc.expirationDate) < new Date()) {
      errors.push(`Credential '${vc.id}' has expired.`);
    }

    // 3c. Check for on-ledger revocation status
    if (options.checkRevocation) {
      try {
        const { revoked, reason } = await checkRevocationStatus(vc, config);
        if (revoked) {
          errors.push(`Credential '${vc.id}' has been revoked. Reason: ${reason}`);
        }
      } catch (e: any) {
        errors.push(`Error checking revocation for credential '${vc.id}': ${e.message}`);
      }
    }
  }

  return {
    verified: errors.length === 0,
    errors,
  };
}
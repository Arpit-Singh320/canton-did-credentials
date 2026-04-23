/**
 * @module canton-did-credentials
 * @description
 * TypeScript SDK for Verifiable Credential Issuers.
 *
 * This module provides the `IssuerService` class, a high-level API for interacting
 * with the Daml-based credential contracts on a Canton ledger. It simplifies the
 * process of creating and revoking W3C-compatible Verifiable Credentials.
 *
 * The service communicates with the ledger's JSON API.
 *
 * @example
 * ```ts
 * import { IssuerService } from './issuer';
 *
 * const config = {
 *   partyId: 'IssuerParty::1220...',
 *   token: 'your-jwt-token',
 *   httpBaseUrl: 'http://localhost:7575',
 * };
 *
 * const issuer = new IssuerService(config);
 *
 * async function issueKycCredential(holderPartyId) {
 *   const credentialCid = await issuer.issueCredential({
 *     holder: holderPartyId,
 *     claims: {
 *       "kycStatus": "Verified",
 *       "jurisdiction": "US",
 *     },
 *   });
 *   console.log(`Issued KYC credential with ID: ${credentialCid}`);
 * }
 * ```
 */

import { randomUUID } from 'crypto';

// Basic type aliases for clarity
export type PartyId = string;
export type ContractId = string;
export type DamlIsoTime = string; // e.g., "2023-10-27T10:00:00.000Z"

/**
 * Configuration for connecting to a Canton ledger participant node's JSON API.
 */
export interface LedgerConfig {
  /** The party ID of the issuer. */
  partyId: PartyId;
  /** A valid JWT for authenticating with the JSON API. */
  token: string;
  /** The base URL of the JSON API (e.g., "http://localhost:7575"). */
  httpBaseUrl: string;
}

/**
 * Arguments for issuing a new Verifiable Credential.
 */
export interface IssueCredentialArgs {
  /** The Daml PartyId of the credential holder (subject). */
  holder: PartyId;
  /** A unique identifier for the credential. If not provided, a UUID will be generated. */
  credentialId?: string;
  /** Optional expiration date in ISO 8601 format. */
  expirationDate?: DamlIsoTime;
  /** A key-value map of claims to be included in the credential subject. */
  claims: Record<string, string>;
}

// Internal types to model JSON API responses
interface CreateResponse {
  status: number;
  result: {
    contractId: ContractId;
    [key: string]: unknown;
  };
  warnings?: unknown;
  errors?: string[];
}

interface ExerciseResponse {
  status: number;
  result: {
    exerciseResult: string; // This is a JSON-encoded string of the choice's return value
    [key: string]: unknown;
  };
  warnings?: unknown;
  errors?: string[];
}

/**
 * Provides methods for a credential issuer to create and manage credentials on Canton.
 *
 * Each instance of this class is configured to act on behalf of a specific issuer party.
 */
export class IssuerService {
  private readonly config: LedgerConfig;
  private readonly headers: Record<string, string>;

  /**
   * Constructs an instance of the IssuerService.
   * @param config - Connection and authentication details for the Canton ledger.
   */
  constructor(config: LedgerConfig) {
    if (!config.httpBaseUrl || !config.token || !config.partyId) {
      throw new Error("Ledger configuration (httpBaseUrl, token, partyId) is required.");
    }
    this.config = config;
    this.headers = {
      "Authorization": `Bearer ${this.config.token}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Issues a new Verifiable Credential to a holder.
   * This creates a `DID.Credential:VerifiableCredential` contract on the ledger,
   * signed by the issuer.
   *
   * @param args - The details of the credential to issue.
   * @returns The ContractId of the newly created VerifiableCredential.
   */
  async issueCredential(args: IssueCredentialArgs): Promise<ContractId> {
    const credentialId = args.credentialId || randomUUID();
    const issuanceDate = new Date().toISOString();

    const createPayload = {
      templateId: "DID.Credential:VerifiableCredential",
      payload: {
        issuer: this.config.partyId,
        holder: args.holder,
        credentialId: credentialId,
        issuanceDate: issuanceDate,
        expirationDate: args.expirationDate ? { Some: args.expirationDate } : { None: {} },
        // Daml `Map` is represented as an array of key-value pairs in the JSON API.
        credentialSubject: Object.entries(args.claims).map(([key, value]) => ({ _1: key, _2: value })),
      },
    };

    const response = await fetch(`${this.config.httpBaseUrl}/v1/create`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(createPayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to issue credential: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const json = await response.json() as CreateResponse;
    if (json.status !== 200 || !json.result?.contractId) {
      throw new Error(`Ledger returned an error for create: ${JSON.stringify(json)}`);
    }

    return json.result.contractId;
  }

  /**
   * Revokes a previously issued credential by exercising a choice on its revocation entry.
   * This operation requires the ContractId of the `DID.Revocation:RevocationListEntry`
   * contract, which is typically created at the time of issuance.
   *
   * @param revocationListEntryCid - The ContractId of the `RevocationListEntry` to update.
   * @returns The ContractId of the new, revoked `RevocationListEntry` contract.
   */
  async revokeCredential(revocationListEntryCid: ContractId): Promise<ContractId> {
    const exercisePayload = {
      templateId: "DID.Revocation:RevocationListEntry",
      contractId: revocationListEntryCid,
      choice: "Revoke",
      argument: {},
    };

    const response = await fetch(`${this.config.httpBaseUrl}/v1/exercise`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(exercisePayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to revoke credential: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const json = await response.json() as ExerciseResponse;
    if (json.status !== 200 || !json.result?.exerciseResult) {
      throw new Error(`Ledger returned an error for exercise: ${JSON.stringify(json)}`);
    }

    // The return value of the 'Revoke' choice is the ContractId of the new, updated contract.
    // The JSON API returns this value as a JSON-encoded string, so it must be parsed.
    const newContractId = JSON.parse(json.result.exerciseResult) as ContractId;
    return newContractId;
  }
}
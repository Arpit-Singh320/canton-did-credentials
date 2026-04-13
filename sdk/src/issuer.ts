/**
 * @module issuer
 * @description This module provides a client-side SDK for credential issuers to interact
 * with the Daml-based Verifiable Credential ledger. It abstracts the complexities of
 * the Daml Ledger JSON API, offering simple functions to issue, revoke, and query
* credentials.
 */

import { ContractId, Party } from '@c7/ledger';
// In a Node.js environment, you would use 'node-fetch'. In a browser, you can use the global fetch.
// We use a generic type here to be environment-agnostic.
import { fetch, RequestInit, Response } from 'node-fetch';

/**
 * Configuration for connecting to the Daml Ledger JSON API.
 */
export interface LedgerConfig {
  /** The hostname or IP address of the JSON API server. */
  host: string;
  /** The port number of the JSON API server. */
  port: number;
  /** The authentication token (JWT) for the party operating the SDK. */
  token: string;
}

/**
 * Represents the subject of a Verifiable Credential, containing the claims made by the issuer.
 * Corresponds to `DA.Map.Map Text Daml.Json.Json` in Daml.
 */
export type CredentialSubject = Record<string, any>;

/**
 * A generic representation of a Daml contract.
 */
export interface DamlContract<T = any> {
  contractId: ContractId<T>;
  templateId: string;
  payload: T;
}

/**
 * The payload for a `VerifiableCredentialProposal` contract.
 */
export interface VerifiableCredentialProposal {
  issuer: Party;
  holder: Party;
  credentialId: string;
  credentialType: string[];
  credentialSubject: CredentialSubject;
  issuanceDate: string; // ISO 8601 Timestamp
  expirationDate: string | null; // ISO 8601 Timestamp or null
  revocationListCid: ContractId<any>;
}

/**
 * The payload for a `VerifiableCredential` contract.
 */
export interface VerifiableCredential extends VerifiableCredentialProposal {
  // Assuming the accepted credential has the same data as the proposal.
}

/**
 * The payload for a `RevocationList` contract.
 */
export interface RevocationList {
  issuer: Party;
  description: string;
  revokedCredentials: Record<string, string>; // Map from Credential ID to Revocation Timestamp
}

/**
 * Builds the base URL for JSON API requests.
 * @param config Ledger connection configuration.
 * @returns The base URL string.
 */
const getApiBaseUrl = (config: LedgerConfig): string => `http://${config.host}:${config.port}`;

/**
 * A generic helper for making requests to the JSON API.
 * @param config Ledger connection configuration.
 * @param endpoint The API endpoint (e.g., 'v1/create').
 * @param body The request body.
 * @returns The JSON response from the API.
 * @throws An error if the API returns a non-200 status.
 */
async function apiRequest<T>(config: LedgerConfig, endpoint: string, body: object): Promise<T> {
  const url = `${getApiBaseUrl(config)}/${endpoint}`;
  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };

  const response: Response = await fetch(url, options);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`JSON API request failed with status ${response.status}: ${errorBody}`);
  }

  const json = await response.json();
  return json.result as T;
}

/**
 * Finds the active `RevocationList` contract for a given issuer.
 * Each issuer should have exactly one such list.
 *
 * @param config The ledger connection configuration.
 * @param issuer The party ID of the credential issuer.
 * @returns A promise that resolves to the `RevocationList` contract, or null if not found.
 */
export async function findRevocationListFor(
  config: LedgerConfig,
  issuer: Party
): Promise<DamlContract<RevocationList> | null> {
  const query = {
    templateIds: ['DID.Revocation:RevocationList'],
    query: { issuer },
  };

  const lists = await apiRequest<DamlContract<RevocationList>[]>(config, 'v1/query', query);
  return lists.length > 0 ? lists[0] : null;
}

/**
 * Proposes a new verifiable credential to a holder.
 * This creates a `VerifiableCredentialProposal` contract on the ledger,
 * which the holder must then accept to receive the final credential.
 *
 * @param config The ledger connection configuration.
 * @param args The arguments for creating the credential proposal.
 * @returns A promise that resolves to the created `VerifiableCredentialProposal` contract.
 */
export async function issueCredentialProposal(
  config: LedgerConfig,
  args: {
    issuer: Party;
    holder: Party;
    credentialId: string;
    credentialType: string[];
    credentialSubject: CredentialSubject;
    expirationDate?: Date;
    revocationListCid: ContractId<RevocationList>;
  }
): Promise<DamlContract<VerifiableCredentialProposal>> {
  const payload = {
    issuer: args.issuer,
    holder: args.holder,
    credentialId: args.credentialId,
    credentialType: args.credentialType,
    credentialSubject: args.credentialSubject,
    issuanceDate: new Date().toISOString(),
    expirationDate: args.expirationDate ? args.expirationDate.toISOString() : null,
    revocationListCid: args.revocationListCid,
  };

  const createCommand = {
    templateId: 'DID.Credential:VerifiableCredentialProposal',
    payload,
  };

  return apiRequest<DamlContract<VerifiableCredentialProposal>>(config, 'v1/create', createCommand);
}

/**
 * Revokes a previously issued verifiable credential.
 * This is done by exercising the `Revoke` choice on the issuer's `RevocationList` contract.
 *
 * @param config The ledger connection configuration.
 * @param revocationListCid The contract ID of the issuer's `RevocationList`.
 * @param credentialId The unique ID of the credential to revoke.
 * @returns A promise that resolves when the revocation is successful.
 */
export async function revokeCredential(
  config: LedgerConfig,
  revocationListCid: ContractId<RevocationList>,
  credentialId: string
): Promise<void> {
  const exerciseCommand = {
    templateId: 'DID.Revocation:RevocationList',
    contractId: revocationListCid,
    choice: 'Revoke',
    argument: {
      credentialIdToRevoke: credentialId,
    },
  };

  await apiRequest(config, 'v1/exercise', exerciseCommand);
}

/**
 * Finds all active `VerifiableCredentialProposal` contracts issued by a specific party.
 *
 * @param config The ledger connection configuration.
 * @param issuer The party ID of the credential issuer.
 * @returns A promise that resolves to an array of credential proposal contracts.
 */
export async function findIssuedProposals(
  config: LedgerConfig,
  issuer: Party
): Promise<DamlContract<VerifiableCredentialProposal>[]> {
  const query = {
    templateIds: ['DID.Credential:VerifiableCredentialProposal'],
    query: { issuer },
  };
  return apiRequest<DamlContract<VerifiableCredentialProposal>[]>(config, 'v1/query', query);
}

/**
 * Finds all active (accepted) `VerifiableCredential` contracts issued by a specific party.
 *
 * @param config The ledger connection configuration.
 * @param issuer The party ID of the credential issuer.
 * @returns A promise that resolves to an array of accepted credential contracts.
 */
export async function findIssuedCredentials(
  config: LedgerConfig,
  issuer: Party
): Promise<DamlContract<VerifiableCredential>[]> {
  const query = {
    templateIds: ['DID.Credential:VerifiableCredential'],
    query: { issuer },
  };
  return apiRequest<DamlContract<VerifiableCredential>[]>(config, 'v1/query', query);
}
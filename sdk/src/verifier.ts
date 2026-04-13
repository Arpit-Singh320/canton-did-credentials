import fetch, { Headers, RequestInit, Response } from 'node-fetch';

/**
 * Represents a party identifier on the Daml ledger.
 */
export type Party = string;

/**
 * Represents a contract identifier on the Daml ledger.
 */
export type ContractId = string;

/**
 * Represents the payload of a CredentialPresentation contract.
 * The structure should match the Daml template `DID.Presentation:CredentialPresentation`.
 */
export interface CredentialPresentation {
  verifier: Party;
  holder: Party;
  issuer: Party;
  credentialId: string;
  credentialType: string;
  revocationHandle: string;
  subjectData: Record<string, any>;
}

/**
 * Represents the successful result of a JSON API query for a single contract.
 */
interface GetContractResponse {
  status: number;
  result: {
    payload: any;
    templateId: string;
    contractId: ContractId;
  };
}

/**
 * Represents the successful result of a JSON API query for multiple contracts.
 */
interface QueryContractsResponse {
  status: number;
  result: {
    payload: any;
    templateId: string;
    contractId: ContractId;
  }[];
}

/**
 * Represents the successful result of exercising a choice.
 */
interface ExerciseChoiceResponse {
    status: number;
    result: {
        exerciseResult: any;
        events: any[];
    };
}


/**
 * Represents the outcome of a credential verification process.
 */
export interface VerificationResult {
  success: boolean;
  message: string;
  error?: 'UNTRUSTED_ISSUER' | 'CREDENTIAL_REVOKED' | 'PRESENTATION_NOT_FOUND' | 'LEDGER_ERROR' | 'UNEXPECTED_PAYLOAD';
  acceptedContractId?: ContractId;
}

/**
 * The VerifierSDK provides methods to interact with the Canton ledger
 * for the purpose of verifying W3C-style Verifiable Credentials.
 */
export class VerifierSDK {
  private readonly ledgerUrl: string;
  private readonly headers: Headers;

  /**
   * Constructs a new instance of the VerifierSDK.
   * @param ledgerUrl The base URL of the Canton ledger's JSON API (e.g., http://localhost:7575).
   * @param token The authentication token (JWT) for the verifier party.
   * @param party The party ID of the verifier. The SDK will act on behalf of this party.
   */
  constructor(
    ledgerUrl: string,
    private readonly token: string,
    private readonly party: Party,
  ) {
    this.ledgerUrl = ledgerUrl.endsWith('/') ? ledgerUrl.slice(0, -1) : ledgerUrl;
    this.headers = new Headers({
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    });
  }

  /**
   * Centralized method for making API requests to the JSON API.
   * @param endpoint The API endpoint to hit (e.g., /v1/query).
   * @param options The fetch request options.
   * @returns The JSON response from the ledger.
   */
  private async apiRequest<T>(endpoint: string, options: RequestInit): Promise<T> {
    const url = `${this.ledgerUrl}${endpoint}`;
    try {
      const response: Response = await fetch(url, options);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Ledger API request failed with status ${response.status} at ${url}: ${errorBody}`);
      }

      const jsonResponse = await response.json();

      if (jsonResponse.status !== 200) {
        const errorDetails = jsonResponse.errors ? JSON.stringify(jsonResponse.errors) : "No error details provided.";
        throw new Error(`Ledger API returned non-200 status in body: ${errorDetails}`);
      }

      return jsonResponse as T;
    } catch (error) {
      console.error("Error during API request:", error);
      throw error;
    }
  }

  /**
   * Fetches a single contract by its Contract ID.
   * @param cid The Contract ID to fetch.
   * @returns The contract details or null if not found.
   */
  private async fetchContract(cid: ContractId): Promise<GetContractResponse['result'] | null> {
    try {
      const response = await this.apiRequest<GetContractResponse>(`/v1/query/${cid}`, {
        method: 'GET',
        headers: this.headers,
      });
      return response.result;
    } catch (error) {
      // A 404 is an expected error if the contract doesn't exist or isn't visible.
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Queries for active contracts based on a template ID and an optional query payload.
   * @param templateId The full template ID (e.g., 'DID.TrustAnchor:TrustAnchor').
   * @param query An optional query object to filter contracts.
   * @returns An array of matching active contracts.
   */
  private async queryContracts(templateId: string, query: Record<string, any> = {}): Promise<QueryContractsResponse['result']> {
    const response = await this.apiRequest<QueryContractsResponse>('/v1/query', {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        templateIds: [templateId],
        query,
      }),
    });
    return response.result;
  }

  /**
   * Exercises a choice on a given contract.
   * @param templateId The full template ID of the contract.
   * @param contractId The ID of the contract to exercise the choice on.
   * @param choice The name of the choice to exercise.
   * @param argument The argument for the choice.
   * @returns The result of the exercise command.
   */
  private async exerciseChoice<T>(templateId: string, contractId: ContractId, choice: string, argument: Record<string, any>): Promise<ExerciseChoiceResponse['result']> {
    const response = await this.apiRequest<ExerciseChoiceResponse>('/v1/exercise', {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        templateId,
        contractId,
        choice,
        argument,
      }),
    });
    return response.result;
  }

  /**
   * Verifies a credential presentation by checking the issuer's trust status and the credential's revocation status.
   * If all checks pass, it exercises the 'AcceptPresentation' choice on the presentation contract.
   *
   * @param presentationCid The Contract ID of the `CredentialPresentation` contract.
   * @returns A `VerificationResult` object detailing the outcome.
   */
  public async verifyPresentation(presentationCid: ContractId): Promise<VerificationResult> {
    try {
      // 1. Fetch the CredentialPresentation contract
      const presentationContract = await this.fetchContract(presentationCid);
      if (!presentationContract) {
        return { success: false, message: `CredentialPresentation contract with ID ${presentationCid} not found or not visible.`, error: 'PRESENTATION_NOT_FOUND' };
      }

      if (presentationContract.templateId !== 'DID.Presentation:CredentialPresentation') {
        return { success: false, message: `Contract ${presentationCid} has template ${presentationContract.templateId}, expected DID.Presentation:CredentialPresentation.`, error: 'UNEXPECTED_PAYLOAD' };
      }

      const presentation = presentationContract.payload as CredentialPresentation;

      // Basic sanity check: is this presentation meant for us?
      if (presentation.verifier !== this.party) {
         return { success: false, message: `Presentation is for verifier ${presentation.verifier}, but we are ${this.party}.`, error: 'UNEXPECTED_PAYLOAD' };
      }

      // 2. Check if the issuer is a trusted anchor for this verifier
      const trustAnchors = await this.queryContracts('DID.TrustAnchor:TrustAnchor', {
        verifier: this.party,
        issuer: presentation.issuer,
      });

      if (trustAnchors.length === 0) {
        return { success: false, message: `Issuer ${presentation.issuer} is not a trusted anchor for verifier ${this.party}.`, error: 'UNTRUSTED_ISSUER' };
      }

      // 3. Check if the credential has been revoked
      const revokedCredentials = await this.queryContracts('DID.Revocation:RevokedCredential', {
        issuer: presentation.issuer,
        revocationHandle: presentation.revocationHandle,
      });

      if (revokedCredentials.length > 0) {
        return { success: false, message: `Credential with handle ${presentation.revocationHandle} has been revoked by ${presentation.issuer}.`, error: 'CREDENTIAL_REVOKED' };
      }

      // 4. All checks passed, accept the presentation
      const exerciseResult = await this.exerciseChoice(
        'DID.Presentation:CredentialPresentation',
        presentationCid,
        'AcceptPresentation',
        {}
      );

      const createdEvent = exerciseResult.events.find(e => 'created' in e);
      const acceptedContractId = createdEvent?.created?.contractId;

      return {
        success: true,
        message: `Credential presentation for type '${presentation.credentialType}' from holder ${presentation.holder} successfully verified and accepted.`,
        acceptedContractId: acceptedContractId
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, message: `An unexpected ledger error occurred: ${errorMessage}`, error: 'LEDGER_ERROR' };
    }
  }
}
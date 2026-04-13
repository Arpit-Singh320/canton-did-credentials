# W3C Compliance Notes for Canton DID/VC Implementation

## 1. Overview

This document outlines how the `canton-did-credentials` project aligns with the core W3C specifications for Decentralized Identifiers (DIDs) and Verifiable Credentials (VCs). Our goal is to provide a W3C-compatible framework that leverages the unique privacy, security, and atomic composability features of the Canton Network and Daml smart contracts.

While we aim for semantic compatibility, our implementation makes specific design choices to natively integrate with Canton's distributed ledger model. This means that while the *concepts* align, the *mechanisms* (e.g., proof, revocation) are implemented using Daml's on-ledger capabilities rather than relying on off-ledger JSON-LD documents and cryptographic signatures in the same way as traditional web implementations.

## 2. Decentralized Identifiers (DID) Core v1.0

The DID Core specification describes a new type of globally unique identifier, the architecture for DID Documents, and the process of DID resolution.

### DID Method (`did:canton`)

This project implicitly defines a new DID method: `did:canton`. A `did:canton` identifier would look something like:

```
did:canton:<network-id>:<party-id-fingerprint>
```

-   `<network-id>`: An identifier for the specific Canton network (e.g., `mainnet`, `devnet`, or a unique hash for a private consortium network).
-   `<party-id-fingerprint>`: The unique cryptographic fingerprint of a Canton `Party`, derived from its public key, which serves as the unique identifier within that network.

### DID Document

In our model, the **DID Document** is not a static JSON file but is represented by a set of active Daml contracts on the ledger, primarily the `DID.TrustAnchor.TrustAnchor` contract.

The mapping from DID Document properties to the `TrustAnchor` contract is as follows:

| DID Document Property  | Daml Implementation                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | The `did:canton` identifier, derived from the `controller` party field of the `TrustAnchor` contract.                                                                           |
| `controller`           | The `controller` field (type `Party`) on the `TrustAnchor` contract. This is the signatory of the contract and the only party who can authorize updates.                          |
| `verificationMethod`   | The Canton participant node associated with the `controller` party holds the key material. The verification key is implicitly the party's public key managed by the Canton protocol. |
| `authentication`       | Any choice exercised by the `controller` on the `TrustAnchor` or related contracts is implicitly an act of authentication. The Canton protocol guarantees the authenticity of submissions. |
| `assertionMethod`      | Similar to `authentication`, when the `controller` exercises a choice to present a credential, it is performing an assertion.                                                   |
| `service`              | Can be modeled as a separate `ServiceEndpoint` contract, keyed by the `TrustAnchor` contract ID, containing endpoint URLs and types.                                            |

### DID Operations (CRUD)

-   **Create (Register)**: A new DID is created when a `TrustAnchor` contract is created on the ledger with the `controller` as the signatory.
-   **Read (Resolve)**: Resolving a `did:canton` identifier involves querying the Canton ledger for the active `TrustAnchor` contract where the `controller` matches the DID. This is performed via the Ledger API by a party who has visibility on the contract.
-   **Update**: The `controller` can update the DID Document by exercising choices on the `TrustAnchor` contract (e.g., to add a new service endpoint or delegate authority). This archives the old contract and creates a new one in a single atomic transaction.
-   **Deactivate (Revoke)**: The `controller` can exercise a `Deactivate` choice on the `TrustAnchor` contract, which archives it permanently without creating a successor. Subsequent resolution attempts will find no active contract, indicating deactivation.

## 3. Verifiable Credentials (VC) Data Model v1.1

The VC Data Model specifies the structure for credentials. Our on-ledger Daml contracts for VCs mirror this structure.

### Core Data Model

A Daml `VerifiableCredential` template semantically maps to the standard VC properties:

| VC Data Model Property | Daml Implementation                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@context`             | Implicitly defined by the Daml template's module and name (`Credential.KYC.KycCredential`). The schema is enforced by the Daml type system.                                                                                       |
| `id`                   | The `ContractId` of the Daml contract, which is a unique, unforgeable identifier for that specific credential instance.                                                                                                            |
| `type`                 | The Daml template name (e.g., `VerifiableCredential`, `KycCredential`).                                                                                                                                                           |
| `issuer`               | The `issuer` field (type `Party`) on the credential contract. The issuer is always a signatory, cryptographically attesting to the issuance.                                                                                     |
| `issuanceDate`         | A `Time` field on the credential contract, populated at the time of creation.                                                                                                                                                   |
| `expirationDate`       | An optional `Time` field. Daml's time-based validation can be used to prevent the use of expired credentials.                                                                                                                       |
| `credentialSubject`    | A nested data type within the Daml template. The `subject` field contains the claims about the holder (e.g., KYC status, jurisdiction). The holder is identified by their `Party` ID.                                            |
| `proof`                | **This is the most significant design difference.** We do **not** use a separate `proof` block with a digital signature (e.g., JWS). Instead, the proof is **implicit and intrinsic** to the Daml model. The act of creating a VC contract requires the `issuer`'s signature, which is cryptographically enforced by the Canton ledger. The integrity of the ledger *is* the proof. This is a stronger and more integrated form of verification. |

### Revocation (Status List 2021)

Instead of relying on off-ledger status lists, we implement revocation directly on-ledger, which is more secure, real-time, and privacy-preserving.

-   **Mechanism**: A `RevocationRegistry` contract is controlled by the issuer. When a credential needs to be revoked, the issuer exercises a `Revoke` choice, which adds the credential's `ContractId` to a revoked list within the registry contract.
-   **Verification**: During verification, the verifier's workflow includes a step to query the issuer's `RevocationRegistry` to ensure the presented credential is not listed as revoked. Because this is an on-ledger query, it can be part of the same atomic transaction as the rest of the verification logic, preventing race conditions.

## 4. Summary of Differences and Advantages

1.  **On-Ledger State**: VCs are active Daml contracts, not static JSON objects. This allows for native, real-time state management (e.g., revocation) and atomic composition with other on-ledger assets and workflows (e.g., Delivery vs. Payment).
2.  **Implicit Proof**: The Canton protocol's cryptographic guarantees of transaction authenticity and integrity replace the need for an explicit `proof` block. The issuer's signatory rights on the contract provide a stronger, non-repudiable proof of issuance than a separable signature.
3.  **Enhanced Privacy**: Canton's privacy model ensures that a VC is only visible to its stakeholders (issuer, holder, and any explicitly disclosed verifiers). This prevents the data leakage common on public blockchains and aligns with data privacy regulations like GDPR.
4.  **Type Safety**: The Daml type system enforces the credential schema at compile time, eliminating an entire class of errors related to malformed data that can occur with flexible JSON-LD contexts.
# W3C Compliance Statement for Canton DID and Verifiable Credentials

This document outlines the `canton-did-credentials` project's alignment with, and deviations from, the relevant World Wide Web Consortium (W3C) specifications for Decentralized Identifiers (DIDs) and Verifiable Credentials (VCs). Our goal is to leverage the unique privacy and atomicity features of Canton and Daml while maintaining conceptual interoperability with the broader self-sovereign identity (SSI) ecosystem.

## 1. Decentralized Identifiers (DIDs) - Core v1.0

**Reference:** [W3C DID Core v1.0](https://www.w3.org/TR/did-core/)

The Canton Network's native identity primitive, the `Party`, serves as the foundation for our DID implementation.

### DID Method: `did:canton`

We propose a conceptual DID method, `did:canton`, where the method-specific identifier is the unique string representation of a Canton `Party`.

-   **Format:** `did:canton:<party-id-string>`
-   **Example:** `did:canton:Issuer::12202f5a...`

### DID Document

A DID Document for a `did:canton` identifier is not stored as a single public document (like on a public blockchain). Instead, it is dynamically constructed by a DID Resolver that has access to the party's participant node on the Canton network.

A resolved DID Document would conform to the W3C structure:

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1"
  ],
  "id": "did:canton:Issuer::12202f5a...",
  "verificationMethod": [{
    "id": "did:canton:Issuer::12202f5a...#keys-1",
    "type": "Ed25519VerificationKey2020",
    "controller": "did:canton:Issuer::12202f5a...",
    "publicKeyMultibase": "zH3C2AVvL...L9L1T"
  }],
  "authentication": [
    "did:canton:Issuer::12202f5a...#keys-1"
  ],
  "assertionMethod": [
    "did:canton:Issuer::12202f5a...#keys-1"
  ]
}
```

-   `id`: The Canton Party DID.
-   `verificationMethod`: The public key associated with the Party, managed by its hosting Canton participant node. The key material is used to sign transactions on the network.
-   `service`: Service endpoints (e.g., for credential issuance) can be represented by on-ledger Daml contracts that define the protocols for interaction.

### DID Operations (CRUD)

-   **Create:** A new DID is created when a participant node allocates a new `Party`. This is a native Canton ledger operation.
-   **Read/Resolve:** Resolution requires querying the Canton network's identity infrastructure or a specific participant node that can attest to the Party's existence and public key.
-   **Update/Deactivate:** Key rotation is managed at the Canton participant node level. Deactivation is conceptually equivalent to the participant operator decommissioning the `Party` and refusing to sign transactions on its behalf.

## 2. Verifiable Credentials (VCs) - Data Model v1.1

**Reference:** [W3C VC Data Model v1.1](https://www.w3.org/TR/vc-data-model/)

Our Daml `VerifiableCredential` template is designed to map directly to the core concepts of the W3C VC Data Model.

### Data Model Mapping

The Daml template `Main.VerifiableCredential` corresponds to a W3C Verifiable Credential as follows:

| W3C VC Property      | Daml Template Field (`Main.VerifiableCredential`)                      | Notes                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | `(ContractId VerifiableCredential)`                                    | The unique, unforgeable Daml Contract ID (`ContractId`) serves as the credential's unique identifier.                                                                           |
| `type`               | `credentialType: Text`                                                 | Explicitly defines the credential type, e.g., "KYCCredential", "AccreditedInvestorCredential".                                                                                    |
| `issuer`             | `issuer: Party`                                                        | The DID of the issuer, e.g., `did:canton:<issuer-party-id>`.                                                                                                                      |
| `issuanceDate`       | Implicit in transaction time                                           | While not an explicit field, the issuance time is recorded cryptographically as part of the Canton transaction metadata. It can be added as an explicit `Time` field if needed. |
| `credentialSubject`  | `holder: Party`, `claims: Text`                                        | The `holder` is the subject's DID. The `claims` field holds the subject's attributes, typically as a JSON string to allow for flexible, complex data structures.                 |
| `proof`              | **Intrinsic to the Canton Transaction**                                | This is the most significant design choice. See section below.                                                                                                                    |
| `credentialStatus`   | `revocationRegistry: Optional (ContractId RevocationRegistry)`         | A link to an on-ledger registry contract for status checks (see Section 3).                                                                                                       |

### Proof and Verification

Instead of a separate `proof` block (e.g., `Ed25519Signature2020`), the authenticity and integrity of a credential are guaranteed by the Canton transaction that created it.

-   **Authenticity:** The transaction creating the `VerifiableCredential` contract is digitally signed by the `issuer` party. This signature is cryptographically verified by the Canton protocol.
-   **Integrity:** The resulting Daml contract is immutable. Any attempt to change it would result in a new transaction, breaking the link to the original issuer's signature.
-   **Verification:** A verifier, when presented with a credential, verifies it by confirming its existence on the ledger. Because of Canton's privacy model, the holder must explicitly disclose the contract to the verifier. The verifier's node will then confirm that the contract is active and that its signatories (the `issuer`) are authentic. This process provides a higher level of assurance than verifying a signature on a detached JSON object.

## 3. Credential Status and Revocation

We implement revocation using an on-ledger `RevocationRegistry` contract, which is conceptually similar to the `StatusList2021` W3C specification.

-   The `issuer` controls a `RevocationRegistry` contract.
-   To revoke a credential, the `issuer` exercises a choice on the registry contract to add the `ContractId` of the revoked credential to a list.
-   Verifiers must be given visibility on both the `VerifiableCredential` contract and the associated `RevocationRegistry` contract.
-   During verification, the verifier checks that the credential's ID is **not** present in the revocation list.
-   This check can be performed atomically within the same Daml transaction as the verification logic, preventing race conditions where a credential is used after it has been revoked.

## 4. Summary of Deviations and Benefits

This project deliberately deviates from a literal interpretation of W3C standards to leverage the superior privacy, security, and atomicity guarantees of the Canton Network.

-   **Deviation: Intrinsic Proof.** We do not use a separable JSON-LD proof block. The proof is the Canton transaction itself.
    -   **Benefit:** Prevents replay attacks and provides stronger proof of provenance. Verification is not just a signature check but a confirmation of the credential's current, active state on a mutually trusted ledger.
-   **Deviation: Privacy-by-Default.** VCs are not public. They are private contracts visible only to the stakeholders (`issuer`, `holder`, and any observers). Disclosure to a `verifier` is an explicit, auditable action controlled by the holder.
    -   **Benefit:** Superior privacy and compliance with data protection regulations like GDPR. There is no public broadcasting of personal information.
-   **Deviation: DID Resolution.** DIDs are resolved via Canton's identity layer, not a global public registry.
    -   **Benefit:** Aligns with enterprise use cases where identity is managed within a consortium or federated ecosystem rather than a fully open, anonymous network.
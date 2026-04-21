# Canton DID & Verifiable Credentials

[![CI](https://github.com/digital-asset/canton-did-credentials/actions/workflows/ci.yml/badge.svg)](https://github.com/digital-asset/canton-did-credentials/actions/workflows/ci.yml)

An implementation of W3C-compatible Decentralized Identifiers (DIDs) and Verifiable Credentials (VCs) on the Canton Network, written in Daml. This project enables privacy-preserving identity verification, selective disclosure of information, and interoperable digital credentials for institutional and retail use cases.

With this framework, parties can prove attributes like KYC/AML status, investor accreditation, or jurisdictional residency to service providers without revealing underlying personal data. This enhances user privacy, reduces data liability for institutions, and streamlines onboarding processes.

## Key Concepts

This project models the core components of the W3C Verifiable Credentials ecosystem.

*   **Issuer:** An entity (e.g., a financial institution, government agency) that attests to certain claims about a subject and issues a Verifiable Credential.
*   **Holder:** The subject of the credential (e.g., an individual, a corporation) who controls the credential and can present it to others for verification.
*   **Verifier:** An entity (e.g., a DeFi protocol, a regulated service) that needs to verify claims about a holder before providing a service.
*   **Verifiable Credential (VC):** A tamper-evident set of claims made by an Issuer about a Holder. In our model, this is represented by a `VerifiableCredential` Daml smart contract.
*   **Decentralized Identifier (DID):** A globally unique, persistent identifier that is controlled by the subject, independent of any centralized registry. On Canton, a `Party` ID serves as a natural DID.
*   **Revocation Registry:** An on-ledger list maintained by an Issuer to publicly declare which credentials are no longer valid.

## How It Works on Canton

The Canton Network's privacy model is uniquely suited for implementing the VC/DID architecture. Daml smart contracts ensure that data is only visible to permissioned stakeholders, providing privacy by default.

1.  **DID Representation**: A Canton `Party` ID (e.g., `Alice::1220...`) functions as a `did:canton` identifier. The control of the party is equivalent to the control of the DID.
2.  **Issuance**: An `Issuer` creates a `VerifiableCredential` contract on the ledger. The `Holder` is typically a signatory or observer on this contract, giving them control over it. The credential contains claims (e.g., `"kyc_status": "verified"`) and metadata like issuance date and issuer identity.
3.  **Presentation & Verification**: To access a service, the `Holder` presents the credential to a `Verifier`. In the Daml workflow, this can be done by referencing the `ContractId` of the `VerifiableCredential`. The `Verifier` can then call a choice on the credential contract to verify its authenticity and check against the `Issuer`'s `RevocationRegistry`.
4.  **Revocation**: If an `Issuer` needs to revoke a credential, they update their on-ledger `RevocationRegistry`. During verification, the `Verifier`'s workflow atomically checks this registry to ensure the credential is still valid.

This entire process occurs atomically and privately on the Canton ledger, without exposing the credential's contents to anyone other than the Issuer, Holder, and the specific Verifier during a transaction.

## Project Structure

```
.
├── daml/
│   ├── Did/
│   │   └── V1.daml               # Core VerifiableCredential and RevocationRegistry templates
│   └── test/
│       └── DIDTest.daml          # Daml Script tests for the issuance/verification/revocation workflow
├── sdk/
│   └── src/
│       ├── issuer.ts             # TypeScript functions for issuing credentials
│       └── verifier.ts           # TypeScript functions for verifying credentials
├── docs/
│   └── W3C_COMPLIANCE.md         # Detailed breakdown of compliance with W3C standards
├── .github/
│   └── workflows/
│       └── ci.yml                # GitHub Actions CI configuration
└── daml.yaml                     # Daml project configuration
```

## W3C Compliance

This project aims for semantic compatibility with the W3C Verifiable Credentials Data Model v1.1 and Decentralized Identifiers (DIDs) v1.0 specifications. While the on-ledger representation is a Daml contract rather than a JSON-LD document, the core concepts (issuer, subject, claims, proof, revocation) are preserved.

For a detailed analysis of how our Daml implementation maps to the W3C standards, please see [docs/W3C_COMPLIANCE.md](./docs/W3C_COMPLIANCE.md).

## Getting Started

### Prerequisites

*   DPM (Digital Asset Package Manager) SDK version 3.4.0 or later. [Installation Guide](https://docs.digitalasset.com/dpm/install.html).

### Build the Project

Compile the Daml code into a DAR (Daml Archive) file.

```bash
dpm build
```

The output will be located in `.daml/dist/canton-did-credentials-0.1.0.dar`.

### Run Tests

Execute the Daml Script tests to simulate the full credential lifecycle.

```bash
dpm test
```

### Run a Local Ledger

To interact with the contracts via a UI or the SDK, start a local Canton sandbox environment.

```bash
dpm sandbox
```

The sandbox exposes two key services:
*   **JSON API:** `http://localhost:7575`
*   **Ledger gRPC API:** `localhost:6866`

## License

This project is licensed under the [Apache License 2.0](LICENSE).
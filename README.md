# Canton DID & Verifiable Credentials

This project provides a Daml implementation of W3C-compatible Decentralized Identifiers (DIDs) and Verifiable Credentials (VCs) tailored for the Canton Network. It enables privacy-preserving identity verification, Know Your Customer (KYC) processes, and selective disclosure of attributes, leveraging Canton's unique privacy and interoperability features.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Solution: DIDs and VCs on Canton](#solution-dids-and-vcs-on-canton)
- [W3C Compliance](#w3c-compliance)
- [Key Features](#key-features)
- [Core Daml Models](#core-daml-models)
- [Workflow Example: Privacy-Preserving KYC](#workflow-example-privacy-preserving-kyc)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Use Cases](#use-cases)
- [License](#license)

## Problem Statement

Traditional identity and KYC processes are fragmented, inefficient, and pose significant privacy risks.
1.  **Data Silos**: Users repeatedly provide the same personal information to different service providers.
2.  **Privacy Exposure**: Sensitive data (e.g., passports, addresses) is copied and stored by multiple entities, increasing the risk of data breaches.
3.  **Lack of Control**: Individuals have little control over how their personal data is used, shared, or revoked.
4.  **High Costs**: Businesses incur significant operational costs for identity verification and compliance.

## Solution: DIDs and VCs on Canton

This project uses the W3C standards for DIDs and VCs to create a decentralized, privacy-preserving identity layer on Canton.

*   **Decentralized Identifiers (DIDs)**: A DID is a globally unique identifier that a party can create and control without relying on a central authority. It resolves to a DID Document containing public keys and service endpoints, enabling secure, peer-to-peer interactions. In our model, a DID is controlled by a Canton party.

*   **Verifiable Credentials (VCs)**: VCs are digital, tamper-proof credentials (like a digital passport or driver's license) issued by a trusted entity (Issuer) to a subject (Holder). The Holder can then present this credential to a third party (Verifier) to prove a claim, such as their identity, age, or accreditation status.

*   **Canton Network Advantage**: Canton provides the ideal substrate for this model. Its privacy-by-default architecture ensures that DIDs and VCs are only visible to the involved parties (Issuer, Holder, Verifier) within their shared privacy domain. This prevents network-wide data leakage and provides the confidentiality required for sensitive identity information. Canton's interoperability allows DIDs and VCs to be used seamlessly across different connected applications and domains.

## W3C Compliance

This implementation is designed to be semantically compatible with the core concepts of the following W3C specifications:

*   **Decentralized Identifiers (DIDs) v1.0**: The data model for DID Documents, including authentication methods and service endpoints, is represented in our Daml templates.
*   **Verifiable Credentials Data Model v1.1**: The structure of our `VerifiableCredential` template aligns with the standard, including fields for `issuer`, `issuanceDate`, `credentialSubject`, and `proof`.

While the on-ledger format is Daml, the data can be serialized to and from the standard JSON-LD format for interoperability with external systems.

## Key Features

*   **DID Lifecycle Management**: Create, update, and deactivate DID Documents on-ledger.
*   **Verifiable Credential Issuance**: A secure proposal/acceptance flow for Issuers to grant credentials to Holders.
*   **Verifiable Presentation**: A workflow for Holders to selectively disclose credentials to Verifiers.
*   **On-Ledger Revocation**: An efficient revocation registry that allows verifiers to check if a credential is still valid.
*   **Privacy-Preserving**: Leverages Canton's fine-grained privacy to ensure that identity data is never exposed to unauthorized parties.
*   **Composable**: Credentials can be used as authorization tokens or inputs for other smart contracts on the network.

## Core Daml Models

The logic is encapsulated in a set of core Daml templates:

| Template                    | Description                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `DidDocument`               | Represents a party's on-ledger DID. Contains public keys, controllers, and service endpoints.            |
| `VerifiableCredential`      | The core credential contract held by the Holder. It is signed by the Issuer and contains claims.         |
| `CredentialIssuanceProposal`| A proposal from an Issuer to a Holder to create a `VerifiableCredential`.                                |
| `CredentialPresentation`    | A contract used by a Holder to present a VC to a Verifier, who can then verify its authenticity.         |
| `RevocationRegistry`        | A public contract managed by an Issuer to list revoked credential IDs.                                   |

## Workflow Example: Privacy-Preserving KYC

This example demonstrates how a user can get a KYC credential and use it to access a financial service without re-submitting documents.

1.  **DID Creation**:
    *   `Alice` (user) creates her `DidDocument` on the ledger, controlled by her Canton party.

2.  **Credential Issuance**:
    *   `KYCProvider`, a trusted issuer, performs an off-ledger identity verification for `Alice`.
    *   `KYCProvider` creates a `CredentialIssuanceProposal` for a `KycCredential` and sends it to `Alice`.
    *   `Alice` accepts the proposal, which creates a `VerifiableCredential` contract in her private contract store, signed by `KYCProvider`. The credential contains a claim like `{"kycVerified": true, "jurisdiction": "US"}`.

3.  **Credential Presentation**:
    *   `DeFiPlatform`, a verifier, requires users to have a valid KYC credential.
    *   `Alice` wants to use the platform. She initiates a `CredentialPresentation` workflow, presenting her `KycCredential` to `DeFiPlatform`.
    *   This is done without revealing the credential to anyone else on the network.

4.  **Credential Verification**:
    *   `DeFiPlatform` receives the presentation.
    *   It automatically verifies three things:
        1.  **Authenticity**: Checks that the credential was signed by `KYCProvider` by fetching `KYCProvider`'s public key from its public `DidDocument`.
        2.  **Integrity**: Ensures the credential content has not been tampered with.
        3.  **Revocation Status**: Checks `KYCProvider`'s `RevocationRegistry` to ensure Alice's credential has not been revoked.
    *   Upon successful verification, `DeFiPlatform` grants Alice access to its services.

## Project Structure

```
.
├── daml/
│   └── Did/
│       ├── Credential.daml     # Main VC templates
│       ├── Did.daml            # DID Document templates
│       └── Revocation.daml     # Revocation registry
├── daml-script/
│   └── Main.daml               # Example script for setup and testing
├── .gitignore
├── daml.yaml                   # Daml project configuration
└── README.md                   # This file
```

## Getting Started

### Prerequisites

*   Daml SDK v3.1.0 or later
*   A running Canton Network environment (or use `daml start` for a local ledger)

### Build the Project

Compile the Daml code into a DAR (Daml Archive) file.

```sh
daml build
```

### Run Tests

Execute the test suites defined in the Daml models.

```sh
daml test
```

### Run Scripts

The `daml-script/Main.daml` file contains a setup script that demonstrates the full issuance and verification flow.

```sh
daml script --dar .daml/dist/canton-did-credentials-0.1.0.dar --script-name Main:setup --ledger-host localhost --ledger-port 6865
```

## Use Cases

This framework is a foundational building block for various applications requiring trusted, portable identity:

*   **Financial Services**: Reusable KYC/AML, investor accreditation for private markets.
*   **DeFi**: Sybil resistance, permissioned liquidity pools, undercollateralized lending.
*   **Healthcare**: Verifiable patient identity, sharing health records with consent.
*   **Supply Chain**: Verifying the identity and credentials of participants (e.g., organic certification).
*   **Education**: Issuing and verifying academic degrees and certifications.

## License

This project is licensed under the [Apache 2.0 License](LICENSE).
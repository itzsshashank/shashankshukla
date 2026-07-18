---
title: "Understanding Palantir's Architecture"
description: "A companion to the Palantir history: how the company's software is actually built, from the Ontology and its data backend to access control, deployment, and AI."
---


# Systems Architecture and Security Analysis of the Palantir Enterprise Operating System

New to Palantir? My earlier piece, [Understanding Palantir](https://itzsshashank.github.io/shashankshukla/blogs/understanding-palantir/), covers the company's history, strategy, and legal fights. This one picks up from there to look at how the platform itself is actually built.

The Palantir software ecosystem represents a significant departure from traditional enterprise software architectures. Historically split into distinct platforms, Gotham for defense intelligence and Foundry for commercial operations, the ecosystem has converged into a unified, modular architecture that Palantir itself now refers to as an Enterprise Operating System.[^1] Unlike traditional data stacks that rely on a disjointed combination of data lakes, catalogs, and business intelligence dashboards, Palantir's architecture collapses data integration, semantic modeling, security, and application deployment into a tightly coupled, globally governed state machine.

This report is a technical breakdown of Palantir's platform design, drawn from public documentation, engineering discourse, patent filings, and open-source repositories. It covers the Ontology system, the evolution of the data backend from Object Storage V1 (Phonograph) to Object Storage V2 (OSv2), the Purpose-Based Access Control (PBAC) security model, the Apollo continuous delivery engine, and the Artificial Intelligence Platform (AIP), along with the boundary between the platform's proprietary core and its open-source components.

---

## 1. The Genesis of the Architecture: Intelligence Augmentation

To understand the technical design of Palantir's platforms, it helps to trace the company's origins to the early 2000s. Emerging from the "PayPal Mafia," founders Peter Thiel, Alex Karp, Stephen Cohen, Joe Lonsdale, and Nathan Gettings sought to apply fraud-detection methodologies developed at PayPal to national security challenges after the September 11 attacks.[^2] At PayPal, engineers had found that purely algorithmic fraud detection was insufficient against adaptive adversaries, which led to "Igor," a hybrid system that used algorithms to flag suspicious activity for human review.[^6]

This "intelligence augmentation" philosophy, using computation to assist human analysts rather than replace them, became Palantir's foundational design principle.[^6] Backed by early funding from In-Q-Tel, the CIA's venture arm, Palantir built Gotham (originally Palantir Government) to process fragmented, highly classified intelligence data.[^42] The operational realities of these early deployments, adversarial environments, air-gapped networks, and strict data governance requirements, pushed the architecture toward prioritizing security propagation and semantic data fusion over simple data storage.[^21]

As the company expanded commercially with Palantir Metropolis (finance-focused, later phased out) and Palantir Foundry (launched 2016), it ran into a related but distinct problem.[^12] Large enterprises like Airbus had data spread across systems that didn't share a common definition of anything: producing the A350 required synchronizing data across millions of parts, hundreds of teams, and multiple disparate ERP and supply chain systems.[^14] The engineering problem was no longer just analyzing data, it was building a unified operational model that could coordinate real-world actions across all of it. That's what led to the Ontology system.

---

## 2. The Ontology System: Semantic Modeling and Kinetic Execution

The Ontology is the central layer of the platform. It sits above raw digital assets (datasets, virtual tables, models) and maps them to their real-world counterparts.[^16]

### 2.1 The Object-Link-Action Model

The Ontology's design departs from traditional relational schemas and tabular representations in favor of five core primitives:

- **Object Types**: Schema definitions for real-world entities or events, such as an *Employee*, *Aircraft*, or *Purchase Order*.[^16] An object instance corresponds to a single real-world entity; an object set is a filtered collection of instances.[^17]
- **Link Types**: Schema-level relationships between two Object Types, for example an *Employee* linked to a *Company* via an `Employee -> Employer` link.[^16]
- **Action Types**: Governed transactions that mutate objects, properties, and links simultaneously, encapsulating business logic and triggering downstream side effects such as notifications or webhooks.[^16]
- **Functions on Objects**: Server-side logic, typically in TypeScript or Python, that runs against the Ontology in a governed environment to read properties, traverse links, and execute complex edits.[^16]
- **Interfaces**: Definitions that describe the shape and capabilities of an Object Type, enabling polymorphism, so different Object Types that share a common structure can be interacted with consistently.[^16]

### 2.2 Architectural Divergence from Standard Paradigms

A more conventional approach here would have been a standard enterprise data catalog (like Collibra or Alation) paired with a property graph database (like Neo4j). Palantir's architecture diverges from that model.[^11]

The reason is that traditional data catalogs are read-only metadata repositories: they track where data lives, but don't support operational workflows. Graph databases, meanwhile, model nodes and edges well, but treat data as purely semantic, pushing business logic, validation, and state mutation off to separate middleware applications. Moving a table from Oracle to a cloud data warehouse doesn't resolve the deeper problem, that a logistics system and a compliance system may define "Purchase Order" or "Transaction" differently in the first place.[^11]

By building "kinetic elements" (Actions and Functions) directly into the semantic model, the Ontology functions not just as a database but as a bidirectional write-API for the enterprise.[^18] When a user updates the status of a supply chain shipment, they don't run a raw SQL `UPDATE`, they invoke an Action Type (e.g., *Flag Shipment for Delay*).[^19] This means business rules, validation logic, and security constraints are all enforced before the write lands, and the action generates an immutable audit trail of who did what and why.[^20]

### 2.3 Microservice Orchestration within the Ontology

A write enters the system through an **Action**, which is validated against the **Ontology Metadata Service (OMS)**, the source of truth for which object, link, and action types are allowed to exist.[^16] Once validated, the edit is picked up by the **Object Data Funnel ("Funnel")**, the microservice that orchestrates writes, reading from both raw datasources and user-submitted edits and indexing them into the storage layer.[^16] Applications then retrieve Ontology data through the **Object Set Service (OSS)**, the high-throughput read layer responsible for searching, filtering, aggregating, and loading object sets.[^16]

The separation between OMS, Funnel, and OSS is deliberate: applications query OSS rather than raw tables, which means they stay resilient even if the underlying data pipelines are re-architected behind the scenes. It also means state (the objects) and state transitions (the actions that change them) don't get siloed into unrelated systems, a pattern that, left unaddressed, tends to produce fragmented governance and inconsistent state across an enterprise.

---

## 3. Data Architecture: Ingestion, Transformation, and the Backend Evolution

Mapping operational reality into the Ontology requires a large underlying data-processing engine. Foundry's data architecture is built to ingest, transform, and serve petabyte-scale data while preserving strict lineage and security propagation.[^14]

### Ingestion and Transformation Mechanics

Data enters through Data Connections using standard protocols (JDBC for relational databases, REST for APIs) or native connectors for systems like SAP.[^23] Palantir treats data engineering as a software development discipline, using tools like Pipeline Builder and Code Repositories.[^25]

The architecture enforces a strict separation between raw ingestion and business logic.[^23] Raw datasets act as snapshot syncs, an exact replica of the external API or database response, preserving a verifiable audit trail.[^23] Subsequent transformations (deduplication, cleaning, joining) run incrementally, so only new or changed records propagate through the pipeline, which meaningfully reduces compute overhead compared to full batch recalculation.

### From Phonograph (OSv1) to Object Storage V2 (OSv2)

The most significant shift in the platform's history is the evolution of the object backend. Serving complex queries, multi-hop link traversals ("Search Arounds") and large aggregations, at sub-second latency required a purpose-built indexing backend.

**Object Storage V1 ("Phonograph")** was Foundry's original object database: a durable, horizontally scalable cluster using distributed indices so the query engine could rapidly traverse and prune large datasets.[^27] It had real limitations, though:

1. **Tight schema coupling.** Enabling user edits (Actions) required developers to create "writeback datasets," physical copies of the input schema that stored historical user modifications.[^26] Because a writeback dataset was tightly coupled to its backing datasource's schema, any upstream schema change could break the writeback logic.[^29]
2. **Manual indexing via Render Hints.** Developers had to manually mark properties as *Sortable*, *Searchable*, or flag them to add a raw index, and adding a raw index meant Phonograph stored an entirely duplicate column, doubling storage overhead for that property.[^30]
3. **Compute overhead.** Actions that write back into the Ontology carry an 18 compute-second minimum overhead.[^28] Phonograph also struggled with large Search Around queries, requiring batch updates for snapshot transactions that drove up compute costs at scale.[^27]

**Object Storage V2 (OSv2)** re-architects the backend around one core change: decoupling the subsystem responsible for data ingestion (indexing) from the one responsible for querying.[^21] Simply scaling out the existing Elasticsearch/Lucene-based clusters behind Phonograph wouldn't have fixed the underlying problem, the tight coupling between reads and writes and the latency of mandatory writeback-dataset rebuilds, so Palantir rebuilt the storage layer instead.[^21] The **Object Data Funnel** is the linchpin of this shift: it asynchronously reads from raw Foundry datasets, streaming sources, and Action-generated user edits, and orchestrates indexing that data into the storage databases.[^21] By removing the hard requirement for writeback datasets, OSv2 allows applications to perform governed operational writes without relying on tightly coupled writeback datasets, rather than treating the Ontology as a brittle caching layer over the true source of truth.[^29] If a downstream pipeline needs a snapshot of the operational state, OSv2 can generate a "materialization" in a few minutes, which meaningfully cuts compute costs versus the old writeback-dataset rebuild cycle.[^29]

| | **Object Storage V1 (Phonograph)** | **Object Storage V2 (OSv2)** |
|---|---|---|
| **Write Mechanism** | Requires "writeback datasets," schema locked to the backing data.[^26] | Edits handled natively via Funnel; materialized datasets are optional.[^26] |
| **Indexing Model** | Manual "Render Hints"; rigid batch/incremental triggers.[^30] | Automated via Funnel; incremental indexing on by default.[^21] |
| **Streaming Support** | Not supported; relies on high-frequency micro-batching.[^30] | Native streaming support for low-latency updates.[^21] |
| **Large Query Handling** | Proprietary index pruning, minimizing physical "hits" during traversal.[^28] | Base index pruning, with on-demand Spark clusters for Search Arounds over 100,000 objects.[^28] |
| **Edit Throughput** | Constrained by batch limits and writeback dataset schedules.[^28] | Handles up to 10,000 object edits in a single Action request before falling back to Spark.[^28] |

Two overhead figures are worth citing precisely rather than a blended comparison: an Action that writes back into the Ontology carries an 18 compute-second minimum overhead (plus roughly 1 additional compute-second per object edited beyond the first), and a Function execution carries a flat 4 compute-second overhead.[^28] These are the two baseline costs Palantir documents for the current system; there isn't a published like-for-like comparison of raw query-pruning overhead between OSv1 and OSv2 specifically, so that particular number is left out above rather than estimated.

Phonograph is scheduled to be fully deprecated by June 30, 2026.[^27] Given the storage overhead and schema-fragility issues above, it's a reasonable inference that the technical debt of maintaining legacy writeback datasets was becoming a real drag on margins, though that specific rationale isn't something Palantir has stated publicly, it's a plausible read of the incentives rather than a confirmed fact.

---

## 4. Security, Governance, and Purpose-Based Access Control

Palantir's security architecture is shaped heavily by its roots in the U.S. Intelligence Community and Department of Defense. Deployments in these sectors often operate under **Impact Level 5 (IL5)** and **Impact Level 6 (IL6)** classifications, which require strict isolation between unclassified, secret, and top-secret workloads.[^23]

### Mandatory Access Controls and Security Propagation

Where traditional enterprise software leans on Discretionary Access Control (DAC) or Role-Based Access Control (RBAC), a resource owner or admin deciding who can view a table, Palantir layers in Mandatory Access Control (MAC) through "Security Markings."[^35] A marking is a persistent label (e.g., "ITAR," "PII," "Operation Classified") attached to a row, column, or dataset.[^23] The key feature is that markings propagate automatically: if an analyst joins a highly classified table with a broadly accessible one, the resulting joined dataset inherits the most restrictive markings of its inputs.[^23] Security labels propagate automatically through derived datasets, so even a user with the right RBAC permissions to view a dashboard will see the underlying data algorithmically redacted if they lack the required marking clearance.[^11]

### Context Collapse and the Case for PBAC

MAC and Markings work well for classified data, but they create real administrative bottlenecks at the scale of a commercial or civilian government deployment. When Palantir deployed for the UK's National Health Service or for Airbus's global supply chain tracking, data governance teams reported being overwhelmed.[^14]

The core problem resembles what privacy researchers elsewhere call *"context collapse"*, the flattening of many different audiences or purposes into one undifferentiated pool of access.[^37] An administrator might see a request to access a `Patient_Records_DB` or a `Supplier_Financials` table and, under standard RBAC, can only grant access based on job title, there's no built-in mechanism to enforce *why* the user needs the data, or to revoke it once the task is done. That tends to accumulate into pockets of perpetual, unjustified access across the enterprise.[^37]

A simpler fix would have been time-expiring Access Control Lists, but those still don't capture the intent behind the access, which makes post-incident auditing difficult.[^35] Palantir's answer is **Purpose-Based Access Control (PBAC)**.[^37] Under PBAC, users don't request access to a dataset, they request access to a predefined "Purpose" (e.g., "Q3 Supply Chain Audit," "Clinical Trial Phase II"):[^37]

1. **Data owners** bind specific, minimized datasets to the Purpose, with a documented rationale.[^37]
2. **Users** apply to join the Purpose, also with a documented rationale for their need.[^37]
3. **The platform** restricts access strictly within a siloed, secure project space tied to that Purpose.[^36]

This maps fairly directly onto the Fair Information Practice Principles' doctrines of data minimization and purpose specification, and when the Purpose ends, or a user's justification becomes invalid, access to the entire data silo is revoked.[^37]

---

## 5. Apollo: Autonomous Deployment in Air-Gapped Environments

A standard B2B SaaS architecture assumes a centrally managed, multi-tenant environment running in a hyperscale public cloud, with upgrades and rollbacks orchestrated through CI/CD tools like Jenkins or GitLab.[^11]

Palantir's customer base doesn't fit that assumption. The company deploys software into classified government clouds, disconnected military networks, edge devices (like the **TITAN** mobile command vehicle or **Skykit** tactical backpacks), and heavily isolated on-premises data centers.[^6] A traditional "push" deployment model doesn't work in these environments, if a CI/CD server can't reach the target over the network, deployment simply doesn't happen.[^11]

Palantir's answer is **Apollo**, an autonomous continuous delivery platform built around a decentralized "pull" model rather than a push model.[^33] Apollo splits the delivery ecosystem into a central "Hub" (the control plane) and many "Spoke" environments (the target clusters, managed by a hardened Kubernetes runtime called **Rubix**, which is also what runs AIP and Foundry themselves and is accredited to FedRAMP High and DoD IL5/IL6 standards).[^51]

- **Artifact Bundling**: Developers compile microservices into cryptographically signed artifact bundles that carry declarative deployment constraints (e.g., "requires PostgreSQL v13," "incompatible with Service X v2.1").[^11]
- **Release Channels**: Releases move through defined channels (Canary, Stable) rather than being pushed directly to servers.[^33]
- **Edge Agents**: A local Apollo agent runs inside every Spoke environment. In air-gapped networks, signed bundles are transported physically, e.g., via secure hard drives, and loaded locally.[^11]
- **Autonomous Execution**: The local agent evaluates maintenance windows, validates dependencies, checks schema compatibility, and orchestrates the upgrade itself, with zero downtime where possible. If it detects a failure post-deployment, it can autonomously roll back to the last known-good state.[^39]

Because Apollo also version-controls the Ontology schema itself, not just application code, it can roll back a multi-layered application state, code and schema together, without corrupting the underlying object databases; this is a reasonable inference from how the OMS governs schema shape, though Palantir hasn't laid it out in exactly these terms.[^11]

---

## 6. Artificial Intelligence Platform (AIP) Architecture

AIP, launched in 2023, brought generative AI into the Palantir stack.[^6] Rather than centering AIP around a proprietary foundation model, Palantir designed it as a model-agnostic orchestration layer, able to route requests to OpenAI's models, Anthropic's Claude, Google's Gemini, or self-hosted open-source models like Llama or Nemotron.[^43]

### The "k-LLM" Paradigm

Palantir describes this internally as the **"k-LLM"** approach. It's often described in coverage as simple model-agnostic routing, picking one best or cheapest model per task, but Palantir's own framing (from CTO Shyam Sankar) is closer to an ensemble method: sending a query to several models at once, then running the results through a synthesis stage that compares the answers, surfaces disagreement between models, and produces a best-available answer along with a record of which models agreed or disagreed.[^52] The practical reasoning for model-agnosticism specifically (as opposed to the ensemble method itself) is twofold:

- **Data Sovereignty**: Defense and regulated commercial clients generally can't send proprietary, classified, or PII data to a public API endpoint. AIP lets them host models on their own internal GPU clusters, so model weights and sensitive data never leave the client's boundary.[^44]
- **Avoiding lock-in on a commoditizing layer**: the foundation-model layer is changing fast, and agnosticism lets enterprises swap in better or cheaper models as they appear.[^43]

### Grounding AI in the Ontology

The more consequential architectural choice is how AIP restricts the model. A naive generative AI setup points an LLM at a vector database and lets it answer via Retrieval-Augmented Generation, which creates a meaningful risk of hallucination and unauthorized data exposure, especially once an AI agent is asked to actually execute actions (rerouting a supply chain, flagging a target) rather than just answer questions.

AIP doesn't point the model at raw files or a standalone vector database. It binds the LLM directly to the Ontology:[^11]

- **Security Inheritance**: The AI agent operates under the same MAC/DAC clearances and PBAC scope as the human user invoking it. It can't traverse a link to a classified object the user isn't cleared to see.[^11]
- **Action Constraints**: If a model determines a supply chain route needs to change, it can't write a SQL query directly. It has to formulate a proposal and submit the intended change through a predefined Action Type, which enforces the same business logic, mandates human-in-the-loop approval where required (a hard requirement for anything touching kinetic military targeting), and logs the interaction immutably.[^43]

The underlying idea is that LLMs are capable reasoning engines but unreliable, non-deterministic databases, so a secure enterprise AI setup subordinates the model to a deterministic, strongly-typed semantic layer: the model proposes, the Ontology governs, validates, and executes.

---

## 7. The Open-Source vs. Proprietary Boundary

Despite running a highly proprietary platform, Palantir has drawn specific, deliberate lines around what it open-sources.

**Open-sourced: the presentation and SDK layers.** Palantir maintains **Blueprint**, a React-based UI toolkit used to build data-dense web interfaces, and continues to optimize it (for example, the migration to Popover2 and the removal of wrapper elements to reduce DOM bloat and improve rendering performance).[^46] It also provides the **Ontology SDK (OSDK)**, letting external developers generate strongly typed client libraries (TypeScript, Python, etc.) to interact with the Ontology from custom applications.[^23]

**Proprietary: the orchestration and state engines.** The core engines, OMS, OSS, Funnel, Apollo, the Rubix substrate, and AIP Logic, remain closed-source.[^1]

The logic behind the split seems fairly clear: Palantir can't anticipate every interface or workflow a customer might need, and forcing everyone onto native low-code builders like Workshop or Slate would alienate engineering teams who want to build their own portals or wire Ontology data into existing corporate applications.[^18] Open-sourcing the presentation layer and the SDK encourages that kind of ecosystem adoption, while the computational value and the underlying "data gravity" stay inside the proprietary backend, since any application built on the OSDK is still fundamentally subject to Foundry's PBAC, MAC/DAC models, and compute billing.[^28]

This pattern resembles what's sometimes called an "hourglass" architecture: broad, open, interoperable layers at the bottom (data storage, JDBC/REST integration) and the top (custom frontends via Blueprint), with a narrow, proprietary neck in the middle, the Ontology engines and Apollo's deployment orchestration, where the platform enforces governance and captures most of its commercial value.

---

## 8. Closing Summary

Palantir's architecture is a fairly direct product of the environments it was built for: intelligence work that couldn't tolerate hallucination or ungoverned data access, air-gapped military networks that couldn't rely on a live network connection to receive updates, and sprawling commercial supply chains where no two systems agreed on what a "Purchase Order" even was. Each major component traces back to one of those constraints, the Ontology exists because data catalogs and graph databases don't enforce business logic on writes; PBAC exists because RBAC alone can't capture why someone needs access, only that they're allowed to have it; Apollo's pull model exists because push deployment assumes a live connection that a lot of Palantir's customers simply don't have; and AIP's design binds language models to the Ontology specifically so an LLM can't act outside whatever the human operator invoking it is already cleared to do.

None of this is unique to Palantir as abstract engineering, most of these ideas (purpose-based access, pull-based deployment, grounding LLMs in a governed data layer) exist elsewhere in some form. What's distinctive is that Palantir built all of them into one integrated stack, under the specific pressure of clients who couldn't tolerate the failure modes that a looser architecture would have allowed.

---

### Works Cited

[^1]: Integrated platforms: AIP, Foundry, and Apollo. Palantir. https://palantir.com/docs/foundry/architecture-center/platforms/
[^2]: The History of Palantir Technologies: From Visionary Beginnings to a Global Data Powerhouse. Markets & Stocks. http://markets.chroniclejournal.com/chroniclejournal/article/marketminute-2025-3-21-the-history-of-palantir-technologies-from-visionary-beginnings-to-a-global-data-powerhouse
[^6]: Palantir. Wikipedia. https://en.wikipedia.org/wiki/Palantir
[^11]: Inside Palantir AIP: How the World's Most Controversial AI Platform Actually Works. Towards AI. https://pub.towardsai.net/inside-palantir-aip-how-the-worlds-most-controversial-ai-platform-actually-works-9ec5b7a6c05a
[^12]: Palantir, Big Data Analytics, Cybersecurity, & AI. Britannica Money. https://www.britannica.com/money/Palantir-Technologies-Inc
[^14]: Palantir & Airbus Partnership Overview. Palantir. https://www.palantir.com/assets/xrfr7uokpv1b/7uEHPTEM0MkKtBFcx2zh63/9d75da5b76439717ac95135b5012479e/Palantir-Airbus-Partnership_Overview.pdf
[^16]: Overview, Ontology. Palantir. https://palantir.com/docs/foundry/ontology/overview/
[^17]: Object and link types, Object types, Overview. Palantir. https://palantir.com/docs/foundry/object-link-types/object-types-overview/
[^18]: Object and link types. Palantir. https://palantir.com/docs/foundry/object-link-types/link-types-overview/
[^19]: Action types, Overview. Palantir. https://palantir.com/docs/foundry/action-types/overview/
[^20]: Palantir Foundry Design Patterns. Spencer Fuller. https://spencerfuller.dev/projects/foundry-patterns/
[^21]: Ontology architecture. Palantir. https://palantir.com/docs/foundry/object-backend/overview/
[^23]: Palantir Security Solutions. Palantir. https://www.palantir.com/attributes/security/
[^25]: Use geospatial data in the Ontology. Palantir. https://palantir.com/docs/foundry/geospatial/ontology/
[^26]: Overview and getting started, Migrate from OSv1 to OSv2. Palantir. https://palantir.com/docs/foundry/object-backend/osv1-osv2-migration/
[^27]: Object Storage V1 (Phonograph) [Planned deprecation]. Palantir. https://palantir.com/docs/foundry/object-databases/object-storage-v1/
[^28]: Compute usage with Ontology queries. Palantir. https://palantir.com/docs/foundry/ontologies/query-compute-usage/
[^29]: Object edits and materializations. Palantir. https://palantir.com/docs/foundry/object-edits/materializations/
[^30]: Object and link types, Metadata, Render hints. Palantir. https://palantir.com/docs/foundry/object-link-types/metadata-render-hints/
[^33]: Introduction, Apollo. Palantir. https://palantir.com/docs/apollo/core/introduction/
[^35]: Platform Governance on Palantir: A Guide to Secure Enterprise AI Scaling. Ethicrithm. https://ethicrithm.com/platform-governance-on-palantir-a-guide-to-secure-enterprise-ai-scaling/
[^37]: Purpose-based Access Controls at Palantir. Palantir. https://www.palantir.com/purpose-based-access-controls/
[^39]: Palantir Apollo: The Layer Above AI Code Generation. Axentia. https://axentia.in/blog/palantir-apollo-the-layer-above-ai-code-generation
[^42]: Palantir Technologies. Grokipedia. https://grokipedia.com/page/Palantir_Technologies
[^43]: What Is Palantir AIP? A Deep Dive into Its Architecture, Use Cases, and Alternatives. Instinctools. https://www.instinctools.com/blog/palantir-aip/
[^44]: Palantir and Nvidia want to change who owns government AI. The New Stack. https://thenewstack.io/palantir-nvidia-sovereign-ai/
[^46]: Popover2 migration, palantir/blueprint Wiki. GitHub. https://github.com/palantir/blueprint/wiki/Popover2-migration
[^51]: The Rubix substrate. Palantir. https://www.palantir.com/docs/foundry/architecture-center/rubix
[^52]: AI-enabled operations: K-LLMs, not LLMs. Palantir Technologies (Shyam Sankar, AIPCon). LinkedIn. https://www.linkedin.com/posts/palantir-technologies_never-use-1-llm-when-you-can-use-k-llms-activity-7109622372021780480-eMPG
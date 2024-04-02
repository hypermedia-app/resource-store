import type { DatasetCore, NamedNode, Term, DataFactory, DatasetCoreFactory } from '@rdfjs/types'
import type { GraphPointer } from 'clownface'
import type { StreamClient } from 'sparql-http-client/StreamClient.js'
import { ASK, CONSTRUCT, INSERT } from '@tpluscode/sparql-builder'
import { sparql } from '@tpluscode/rdf-string'
import fromStream from 'rdf-dataset-ext/fromStream.js'
import type { Environment } from '@rdfjs/environment/Environment.js'
import type ClownfaceFactory from 'clownface/Factory.js'

/**
 * Provides functions to work with individual resources.
 *
 * Implementors should take care to retrieve and manipulate only resource's "own" triples,
 * that is, avoid retrieving inferred statements or statements from other resources' representations.
 */
export interface ResourceStore<D extends DatasetCore = DatasetCore> {
  exists(term: Term): Promise<boolean>

  load(term: Term): Promise<GraphPointer<NamedNode, D>>

  save(resource: GraphPointer<NamedNode>): Promise<void>

  delete(term: Term): Promise<void>
}

function assertNamedNode(term: Term): asserts term is NamedNode {
  if (term.termType !== 'NamedNode') {
    throw new Error('Term must be a named node')
  }
}

/**
 * Default implementation of {@see ResourceStore}, which keeps each resource
 * is its own named graph.
 */
export class ResourcePerGraphStore<D extends DatasetCore> implements ResourceStore<D> {
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  constructor(private client: StreamClient, private env: Environment<DataFactory | DatasetCoreFactory<any, any, D> | ClownfaceFactory>) {
  }

  exists(term: Term): Promise<boolean> {
    assertNamedNode(term)

    return ASK`?s ?p ?o`.FROM(term).execute(this.client)
  }

  async load(term: Term): Promise<GraphPointer<NamedNode, D>> {
    assertNamedNode(term)

    const dataset = await fromStream(this.env.dataset(), CONSTRUCT`?s ?p ?o`
      .FROM(term)
      .WHERE`?s ?p ?o`
      .execute(this.client))

    return this.env.clownface({ dataset, term })
  }

  async save(resource: GraphPointer<NamedNode>): Promise<void> {
    const insert = INSERT.DATA`GRAPH ${resource.term} { ${resource.dataset} }`
    const query = sparql`DROP SILENT GRAPH ${resource.term}; ${insert}`

    return this.client.query.update(query.toString())
  }

  async delete(term: Term): Promise<void> {
    const query = sparql`DROP SILENT GRAPH ${term}`
    return this.client.query.update(query.toString())
  }
}

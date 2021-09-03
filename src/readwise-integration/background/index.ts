import StorageManager from '@worldbrain/storex'
import type {
    ReadwiseAPI,
    ReadwiseHighlight,
} from '@worldbrain/memex-common/lib/readwise-integration/api/types'
import { HTTPReadwiseAPI } from '@worldbrain/memex-common/lib/readwise-integration/api'
import {
    formatReadwiseHighlightNote,
    formatReadwiseHighlightTime,
    formatReadwiseHighlightLocation,
} from '@worldbrain/memex-common/lib/readwise-integration/utils'
import * as Raven from 'src/util/raven'
import type { ReadwiseSettings } from './types/settings'
import type { BrowserSettingsStore } from 'src/util/settings'
import { Annotation } from 'src/annotations/types'
import { ReadwiseInterface } from './types/remote-interface'
import {
    remoteFunctionWithoutExtraArgs,
    registerRemoteFunctions,
} from 'src/util/webextensionRPC'
import { Page } from 'src/search'

type ReadwiseInterfaceMethod<
    Method extends keyof ReadwiseInterface<'provider'>
> = ReadwiseInterface<'provider'>[Method]['function']

type PageData = Pick<Page, 'fullTitle' | 'fullUrl' | 'url'>
type GetPageData = (normalizedUrl: string) => Promise<PageData>
type GetAnnotationTags = (annotationUrl: string) => Promise<string[]>

export class ReadwiseBackground {
    remoteFunctions: ReadwiseInterface<'provider'>
    readwiseAPI: ReadwiseAPI
    private _apiKey: string | null = null

    constructor(
        private options: {
            storageManager: StorageManager
            settingsStore: BrowserSettingsStore<ReadwiseSettings>
            fetch: typeof fetch
            getPageData: GetPageData
            getAnnotationTags: GetAnnotationTags
            streamAnnotations(): AsyncIterableIterator<Annotation>
        },
    ) {
        this.readwiseAPI = new HTTPReadwiseAPI({
            fetch: options.fetch,
        })

        this.remoteFunctions = {
            validateAPIKey: remoteFunctionWithoutExtraArgs(this.validateAPIKey),
            getAPIKey: remoteFunctionWithoutExtraArgs(this.getAPIKey),
            setAPIKey: remoteFunctionWithoutExtraArgs(this.setAPIKey),
            uploadAllAnnotations: remoteFunctionWithoutExtraArgs(
                this.uploadAllAnnotations,
            ),
        }
    }

    setupRemoteFunctions() {
        registerRemoteFunctions(this.remoteFunctions)
    }

    validateAPIKey: ReadwiseInterfaceMethod<'validateAPIKey'> = async ({
        key,
    }) => {
        const result = await this.readwiseAPI.validateKey(key)
        return result
    }

    getAPIKey: ReadwiseInterfaceMethod<'getAPIKey'> = async () => {
        if (this._apiKey != null) {
            return this._apiKey
        }

        const a = await this.options.settingsStore.get('apiKey')
        this._apiKey = a ?? null
        return this._apiKey
    }

    setAPIKey: ReadwiseInterfaceMethod<'setAPIKey'> = async ({
        validatedKey,
    }) => {
        await this.options.settingsStore.set('apiKey', validatedKey)
        this._apiKey = validatedKey
    }

    uploadAllAnnotations: ReadwiseInterfaceMethod<
        'uploadAllAnnotations'
    > = async () => {
        const getFullPageUrl = makePageDataCache({
            getPageData: this.options.getPageData,
        })

        const apiKey = this._apiKey ?? (await this.getAPIKey())
        if (!apiKey) {
            throw new Error(
                'Attempted readwise highlight upload without API key set',
            )
        }

        const annotationBatch: Annotation[] = []
        for await (const annotation of this.options.streamAnnotations()) {
            const tags = await this.options.getAnnotationTags(annotation.url)
            annotationBatch.push({ ...annotation, tags })
        }

        const highlights = (
            await Promise.all(
                annotationBatch.map(async (annotation) => {
                    try {
                        const pageData = await getFullPageUrl(
                            annotation.pageUrl,
                        )
                        return annotationToReadwise(annotation, {
                            pageData,
                        })
                    } catch (e) {
                        console.error(e)
                        Raven.captureException(e)
                        return null
                    }
                }),
            )
        ).filter((highlight) => !!highlight)

        if (highlights.length) {
            await this.readwiseAPI.postHighlights(apiKey, highlights)
        }
    }
}

function annotationToReadwise(
    annotation: Omit<Annotation, 'pageTitle'>,
    options: { pageData: PageData },
): ReadwiseHighlight {
    return {
        title: options.pageData.fullTitle ?? options.pageData.url,
        source_url: options.pageData.fullUrl,
        source_type: 'article',
        highlighted_at: annotation.createdWhen,
        location_type: 'order',
        location: formatReadwiseHighlightLocation(annotation?.selector),
        note: formatReadwiseHighlightNote(annotation?.comment, annotation.tags),
        text: annotation?.body?.length
            ? annotation.body
            : formatReadwiseHighlightTime(annotation?.createdWhen),
    }
}

function makePageDataCache(options: { getPageData: GetPageData }): GetPageData {
    const pageDataCache: { [normalizedUrl: string]: PageData } = {}
    return async (normalizedUrl: string) => {
        if (pageDataCache[normalizedUrl]) {
            return pageDataCache[normalizedUrl]
        }
        const pageData = await options.getPageData(normalizedUrl)
        if (!pageData) {
            throw new Error(
                `Can't get full URL for annotation to upload to Readwise`,
            )
        }
        pageDataCache[normalizedUrl] = pageData
        return pageData
    }
}

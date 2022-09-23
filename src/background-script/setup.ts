import kebabCase from 'lodash/kebabCase'
import type { Browser } from 'webextension-polyfill'
import { UAParser } from 'ua-parser-js'
import StorageManager from '@worldbrain/storex'
import { updateOrCreate } from '@worldbrain/storex/lib/utils'
import NotificationBackground from 'src/notifications/background'
import SocialBackground from 'src/social-integration/background'
import DirectLinkingBackground from 'src/annotations/background'
import SearchBackground from 'src/search/background'
import EventLogBackground from 'src/analytics/internal/background'
import JobSchedulerBackground from 'src/job-scheduler/background'
import { jobs } from 'src/job-scheduler/background/jobs'
import CustomListBackground from 'src/custom-lists/background'
import TagsBackground from 'src/tags/background'
import BookmarksBackground from 'src/bookmarks/background'
import * as backup from '../backup-restore/background'
import { getAuth } from 'firebase/auth'
import {
    getStorage,
    ref,
    uploadString,
    uploadBytes,
    getDownloadURL,
} from 'firebase/storage'
import {
    registerModuleMapCollections,
    StorageModule,
} from '@worldbrain/storex-pattern-modules'
import { firebaseService } from '@worldbrain/memex-common/lib/firebase-backend/services/client'
import {
    setImportStateManager,
    ImportStateManager,
} from 'src/imports/background/state-manager'
import transformPageHTML from 'src/util/transform-page-html'
import { setupImportBackgroundModule } from 'src/imports/background'
import BackgroundScript from '.'
import { setupNotificationClickListener } from 'src/util/notifications'
import { StorageChangesManager } from 'src/util/storage-changes'
import { AuthBackground } from 'src/authentication/background'
// import { FeatureOptIns } from 'src/features/background/feature-opt-ins'
import { FeaturesBeta } from 'src/features/background/feature-beta'
// import { ConnectivityCheckerBackground } from 'src/connectivity-checker/background'
import { FetchPageProcessor } from 'src/page-analysis/background/types'
import { PageIndexingBackground } from 'src/page-indexing/background'
import { combineSearchIndex } from 'src/search/search-index'
import { StorexHubBackground } from 'src/storex-hub/background'
import { JobScheduler } from 'src/job-scheduler/background/job-scheduler'
import { bindMethod } from 'src/util/functions'
import { ContentScriptsBackground } from 'src/content-scripts/background'
import { InPageUIBackground } from 'src/in-page-ui/background'
import { AnalyticsBackground } from 'src/analytics/background'
import { Analytics } from 'src/analytics/types'
import { PipelineRes } from 'src/search'
import CopyPasterBackground from 'src/copy-paster/background'
import { ReaderBackground } from 'src/reader/background'
import { ServerStorage } from 'src/storage/types'
import ContentSharingBackground from 'src/content-sharing/background'
import ContentConversationsBackground from 'src/content-conversations/background'
import { getFirebase } from 'src/util/firebase-app-initialized'
import TabManagementBackground from 'src/tab-management/background'
import {
    runInTab,
    RemoteEventEmitter,
    RemoteEvents,
    remoteEventEmitter,
} from 'src/util/webextensionRPC'
import { PageAnalyzerInterface } from 'src/page-analysis/types'
import { ReadwiseBackground } from 'src/readwise-integration/background'
import pick from 'lodash/pick'
import ActivityIndicatorBackground from 'src/activity-indicator/background'
import ActivityStreamsBackground from 'src/activity-streams/background'
import { SyncSettingsBackground } from 'src/sync-settings/background'
import { AuthServices, Services } from 'src/services/types'
import { captureException } from 'src/util/raven'
import { PDFBackground } from 'src/pdf/background'
import { FirebaseUserMessageService } from '@worldbrain/memex-common/lib/user-messages/service/firebase'
import { UserMessageService } from '@worldbrain/memex-common/lib/user-messages/service/types'
import {
    PersonalDeviceType,
    PersonalDeviceProduct,
} from '@worldbrain/memex-common/lib/personal-cloud/storage/types'
import { PersonalCloudBackground } from 'src/personal-cloud/background'
import {
    PersonalCloudBackend,
    PersonalCloudService,
    PersonalCloudClientStorageType,
} from '@worldbrain/memex-common/lib/personal-cloud/backend/types'
import { BrowserSettingsStore } from 'src/util/settings'
import { LocalPersonalCloudSettings } from 'src/personal-cloud/background/types'
import { authChanges } from '@worldbrain/memex-common/lib/authentication/utils'
import FirebasePersonalCloudBackend from '@worldbrain/memex-common/lib/personal-cloud/backend/firebase'
import { getCurrentSchemaVersion } from '@worldbrain/memex-common/lib/storage/utils'
import { StoredContentType } from 'src/page-indexing/background/types'
import transformPageText from 'src/util/transform-page-text'
import { ContentSharingBackend } from '@worldbrain/memex-common/lib/content-sharing/backend'
import type { ReadwiseSettings } from 'src/readwise-integration/background/types/settings'
import type { LocalExtensionSettings } from './types'
import { normalizeUrl } from '@worldbrain/memex-url-utils/lib/normalize/utils'
import { createSyncSettingsStore } from 'src/sync-settings/util'
import DeprecatedStorageModules from './deprecated-storage-modules'

export interface BackgroundModules {
    auth: AuthBackground
    analytics: AnalyticsBackground
    notifications: NotificationBackground
    social: SocialBackground
    pdfBg: PDFBackground
    // connectivityChecker: ConnectivityCheckerBackground
    activityIndicator: ActivityIndicatorBackground
    directLinking: DirectLinkingBackground
    pages: PageIndexingBackground
    search: SearchBackground
    eventLog: EventLogBackground
    customLists: CustomListBackground
    jobScheduler: JobSchedulerBackground
    tags: TagsBackground
    bookmarks: BookmarksBackground
    backupModule: backup.BackupBackgroundModule
    syncSettings: SyncSettingsBackground
    bgScript: BackgroundScript
    contentScripts: ContentScriptsBackground
    inPageUI: InPageUIBackground
    // features: FeatureOptIns
    featuresBeta: FeaturesBeta
    storexHub: StorexHubBackground
    copyPaster: CopyPasterBackground
    readable: ReaderBackground
    contentSharing: ContentSharingBackground
    contentConversations: ContentConversationsBackground
    tabManagement: TabManagementBackground
    readwise: ReadwiseBackground
    activityStreams: ActivityStreamsBackground
    userMessages: UserMessageService
    personalCloud: PersonalCloudBackground
}

const globalFetch: typeof fetch =
    typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null

export function createBackgroundModules(options: {
    storageManager: StorageManager
    persistentStorageManager: StorageManager
    authServices: AuthServices
    servicesPromise: Promise<Services>
    browserAPIs: Browser
    getServerStorage: () => Promise<ServerStorage>
    localStorageChangesManager: StorageChangesManager
    callFirebaseFunction: <Returns>(
        name: string,
        ...args: any[]
    ) => Promise<Returns>
    personalCloudBackend?: PersonalCloudBackend
    contentSharingBackend?: ContentSharingBackend
    fetchPageDataProcessor?: FetchPageProcessor
    auth?: AuthBackground
    analyticsManager: Analytics
    captureException?: typeof captureException
    userMessageService?: UserMessageService
    getNow?: () => number
    fetch?: typeof fetch
    generateServerId?: (collectionName: string) => number | string
    createRemoteEventEmitter?<ModuleName extends keyof RemoteEvents>(
        name: ModuleName,
        options?: { broadcastToTabs?: boolean },
    ): RemoteEventEmitter<ModuleName>
    getFCMRegistrationToken?: () => Promise<string>
    userAgentString?: string
}): BackgroundModules {
    const createRemoteEventEmitter =
        options.createRemoteEventEmitter ?? remoteEventEmitter
    const getNow = options.getNow ?? (() => Date.now())
    const fetch = options.fetch ?? globalFetch
    const generateServerId =
        options.generateServerId ??
        ((collectionName) =>
            getFirebase().firestore().collection(collectionName).doc().id)

    const { storageManager } = options
    const getServerStorage = async () =>
        (await options.getServerStorage()).modules
    const getServerStorageManager = async () =>
        (await options.getServerStorage()).manager

    const syncSettings = new SyncSettingsBackground({
        storageManager,
        localBrowserStorage: options.browserAPIs.storage.local,
    })

    const syncSettingsStore = createSyncSettingsStore({
        syncSettingsBG: syncSettings,
    })

    const tabManagement = new TabManagementBackground({
        browserAPIs: options.browserAPIs,
        extractRawPageContent: (tabId) =>
            runInTab<PageAnalyzerInterface>(tabId).extractRawPageContent(),
    })
    const callFirebaseFunction = <Returns>(name: string, ...args: any[]) => {
        const call = options.callFirebaseFunction
        if (!call) {
            throw new Error(
                `Tried to call Firebase Function '${name}', but did not provide a function to call it`,
            )
        }
        return call<Returns>(name, ...args)
    }

    const analytics = new AnalyticsBackground(options.analyticsManager, {
        localBrowserStorage: options.browserAPIs.storage.local,
    })

    const pages = new PageIndexingBackground({
        persistentStorageManager: options.persistentStorageManager,
        fetchPageData: options.fetchPageDataProcessor,
        pageIndexingSettingsStore: new BrowserSettingsStore(
            options.browserAPIs.storage.local,
            { prefix: 'pageIndexing.' },
        ),
        createInboxEntry,
        storageManager,
        tabManagement,
        getNow,
    })
    tabManagement.events.on('tabRemoved', async (event) => {
        await pages.handleTabClose(event)
    })
    const bookmarks = new BookmarksBackground({
        storageManager,
        pages,
        analytics,
        browserAPIs: options.browserAPIs,
    })
    const searchIndex = combineSearchIndex({
        getDb: async () => storageManager,
    })

    const search = new SearchBackground({
        storageManager,
        pages,
        idx: searchIndex,
        browserAPIs: options.browserAPIs,
        bookmarks,
    })

    const tags = new TagsBackground({
        storageManager,
        pages,
        tabManagement,
        queryTabs: bindMethod(options.browserAPIs.tabs, 'query'),
        searchBackgroundModule: search,
        analytics,
        localBrowserStorage: options.browserAPIs.storage.local,
    })

    const reader = new ReaderBackground({ storageManager })

    const pdfBg = new PDFBackground({
        webRequestAPI: options.browserAPIs.webRequest,
        runtimeAPI: options.browserAPIs.runtime,
        storageAPI: options.browserAPIs.storage,
        tabsAPI: options.browserAPIs.tabs,
        syncSettings: syncSettingsStore,
    })

    const notifications = new NotificationBackground({ storageManager })

    const jobScheduler = new JobSchedulerBackground({
        storagePrefix: JobScheduler.STORAGE_PREFIX,
        storageAPI: options.browserAPIs.storage,
        alarmsAPI: options.browserAPIs.alarms,
        notifications,
        jobs,
    })

    const social = new SocialBackground({ storageManager })

    const activityIndicator = new ActivityIndicatorBackground({
        authServices: options.authServices,
        servicesPromise: options.servicesPromise,
        syncSettings: syncSettingsStore,
        getActivityStreamsStorage: async () =>
            (await options.getServerStorage()).modules.activityStreams,
    })

    const directLinking = new DirectLinkingBackground({
        browserAPIs: options.browserAPIs,
        storageManager,
        socialBg: social,
        pages,
        analytics,
        getServerStorage,
        preAnnotationDelete: async (params) => {
            await contentSharing.deleteAnnotationShare(params)
        },
    })

    const customLists = new CustomListBackground({
        analytics,
        storageManager,
        tabManagement,
        queryTabs: bindMethod(options.browserAPIs.tabs, 'query'),
        windows: options.browserAPIs.windows,
        searchIndex: search.searchIndex,
        pages,
        localBrowserStorage: options.browserAPIs.storage.local,
        getServerStorage,
        authServices: options.authServices,
        removeChildAnnotationsFromList: directLinking.removeChildAnnotationsFromList.bind(
            directLinking,
        ),
    })

    const auth =
        options.auth ||
        new AuthBackground({
            authServices: options.authServices,
            jobScheduler: jobScheduler.scheduler,
            remoteEmitter: createRemoteEventEmitter('auth'),
            localStorageArea: options.browserAPIs.storage.local,
            getFCMRegistrationToken: options.getFCMRegistrationToken,
            backendFunctions: {
                registerBetaUser: async (params) =>
                    callFirebaseFunction('registerBetaUser', params),
            },
            getUserManagement: async () =>
                (await options.getServerStorage()).modules.users,
        })

    const activityStreams = new ActivityStreamsBackground({
        storageManager,
        callFirebaseFunction,
    })

    if (!options.userMessageService) {
        const userMessagesService = new FirebaseUserMessageService({
            firebase: getFirebase,
            auth: {
                getCurrentUserId: async () =>
                    (await auth.authService.getCurrentUser())?.id,
            },
        })
        options.userMessageService = userMessagesService
        userMessagesService.startListening({
            auth: { events: auth.authService.events },
            lastSeen: {
                get: async () =>
                    (
                        await options.browserAPIs.storage.local.get(
                            'userMessages.lastSeen',
                        )
                    ).lastUserMessageSeen,
                set: async (value) => {
                    await options.browserAPIs.storage.local.set({
                        'userMessages.lastSeen': value,
                    })
                },
            },
        })
    }
    const userMessages = options.userMessageService

    const readwiseSettingsStore = new BrowserSettingsStore<ReadwiseSettings>(
        syncSettings,
        { prefix: 'readwise.' },
    )

    const readwise = new ReadwiseBackground({
        fetch,
        storageManager,
        customListsBG: customLists,
        annotationsBG: directLinking,
        settingsStore: readwiseSettingsStore,
        getPageData: async (normalizedUrl) =>
            pick(
                await pages.storage.getPage(normalizedUrl),
                'url',
                'fullUrl',
                'fullTitle',
            ),
    })

    const localExtSettingStore = new BrowserSettingsStore<
        LocalExtensionSettings
    >(options.browserAPIs.storage.local, {
        prefix: 'localSettings.',
    })

    // const connectivityChecker = new ConnectivityCheckerBackground({
    //     xhr: new XMLHttpRequest(),
    //     jobScheduler: jobScheduler.scheduler,
    // })

    const storePageContent = async (content: PipelineRes): Promise<void> => {
        await pages.createOrUpdatePage(content)
    }

    async function createInboxEntry(fullPageUrl: string) {
        await customLists.createInboxListEntry({ fullUrl: fullPageUrl })
    }

    const personalCloudSettingStore = new BrowserSettingsStore<
        LocalPersonalCloudSettings
    >(options.browserAPIs.storage.local, {
        prefix: 'personalCloud.',
    })
    const personalCloud: PersonalCloudBackground = new PersonalCloudBackground({
        storageManager,
        syncSettingsStore,
        getServerStorageManager,
        runtimeAPI: options.browserAPIs.runtime,
        jobScheduler: jobScheduler.scheduler,
        persistentStorageManager: options.persistentStorageManager,
        backend:
            options.personalCloudBackend ??
            new FirebasePersonalCloudBackend({
                firebase: {
                    ref,
                    getAuth,
                    getStorage,
                    uploadBytes,
                    uploadString,
                    getDownloadURL,
                },
                getServerStorageManager,
                personalCloudService: firebaseService<PersonalCloudService>(
                    'personalCloud',
                    callFirebaseFunction,
                ),
                getCurrentSchemaVersion: () =>
                    getCurrentSchemaVersion(options.storageManager),
                userChanges: () => authChanges(auth.authService),
                getLastUpdateProcessedTime: () =>
                    personalCloudSettingStore.get('lastSeen'),
                // NOTE: this is for retrospective collection sync, which is currently unused in the extension
                getLastCollectionDataProcessedTime: async () => 0,
                getDeviceId: async () => personalCloud.deviceId!,
                getClientDeviceType: () => PersonalDeviceType.DesktopBrowser,
            }),
        remoteEventEmitter: createRemoteEventEmitter('personalCloud'),
        createDeviceId: async (userId) => {
            const uaParser = new UAParser(options.userAgentString)
            const serverStorage = await options.getServerStorage()
            const device = await serverStorage.modules.personalCloud.createDeviceInfo(
                {
                    device: {
                        type: PersonalDeviceType.DesktopBrowser,
                        os: kebabCase(uaParser.getOS().name),
                        browser: kebabCase(uaParser.getBrowser().name),
                        product: PersonalDeviceProduct.Extension,
                    },
                    userId,
                },
            )
            return device.id
        },
        settingStore: personalCloudSettingStore,
        localExtSettingStore,
        getUserId: async () =>
            (await auth.authService.getCurrentUser())?.id ?? null,
        async *userIdChanges() {
            for await (const nextUser of authChanges(auth.authService)) {
                yield nextUser
            }
        },
        writeIncomingData: async (params) => {
            const incomingStorageManager =
                params.storageType === PersonalCloudClientStorageType.Persistent
                    ? options.persistentStorageManager
                    : options.storageManager

            // Add any newly created lists to the list suggestion cache
            if (
                params.collection === 'customLists' &&
                params.updates.id != null
            ) {
                const existingList = await options.storageManager.backend.operation(
                    'findObject',
                    params.collection,
                    { id: params.updates.id },
                )

                if (existingList == null) {
                    await customLists.updateListSuggestionsCache({
                        added: params.updates.id,
                    })
                }
            }

            // WARNING: Keep in mind this skips all storage middleware
            await updateOrCreate({
                ...params,
                storageManager: incomingStorageManager,
                executeOperation: (...args: any[]) => {
                    return (incomingStorageManager.backend.operation as any)(
                        ...args,
                    )
                },
            })

            if (params.collection === 'docContent') {
                const { normalizedUrl, storedContentType } = params.where ?? {}
                const { content } = params.updates
                if (!normalizedUrl || !content) {
                    console.warn(
                        `Got an incoming page, but it didn't include a URL and a body`,
                    )
                    return
                }

                const processed =
                    storedContentType === StoredContentType.HtmlBody
                        ? transformPageHTML({
                              html: content,
                          }).text
                        : transformPageText({
                              text: (content.pageTexts ?? []).join(' '),
                          }).text
                await storageManager.backend.operation(
                    'updateObjects',
                    'pages',
                    {
                        url: normalizedUrl,
                    },
                    { text: processed },
                )
            }
        },
    })

    const contentSharing = new ContentSharingBackground({
        backend:
            options.contentSharingBackend ??
            firebaseService<ContentSharingBackend>(
                'personalCloud',
                callFirebaseFunction,
            ),
        remoteEmitter: createRemoteEventEmitter('contentSharing', {
            broadcastToTabs: true,
        }),
        waitForSync: () => personalCloud.actionQueue.waitForSync(),
        storageManager,
        contentSharingSettingsStore: new BrowserSettingsStore(
            options.browserAPIs.storage.local,
            { prefix: 'contentSharing.' },
        ),
        customListsBG: customLists,
        annotations: directLinking.annotationStorage,
        auth,
        analytics: options.analyticsManager,
        getServerStorage,
        servicesPromise: options.servicesPromise,
        captureException: options.captureException,
        generateServerId,
    })

    const copyPaster = new CopyPasterBackground({
        storageManager,
        contentSharing,
        search,
    })

    const bgScript = new BackgroundScript({
        storageChangesMan: options.localStorageChangesManager,
        urlNormalizer: normalizeUrl,
        runtimeAPI: options.browserAPIs.runtime,
        storageAPI: options.browserAPIs.storage,
        tabsAPI: options.browserAPIs.tabs,
        localExtSettingStore,
        syncSettingsStore,
        storageManager,
        bgModules: {
            readwise,
            copyPaster,
            customLists,
            syncSettings,
            tabManagement,
            personalCloud,
            notifications,
        },
    })

    return {
        auth,
        social,
        analytics,
        jobScheduler,
        notifications,
        // connectivityChecker,
        readable: reader,
        pdfBg,
        directLinking,
        search,
        eventLog: new EventLogBackground({ storageManager }),
        activityIndicator,
        customLists,
        tags,
        bookmarks,
        tabManagement,
        readwise,
        syncSettings,
        backupModule: new backup.BackupBackgroundModule({
            storageManager,
            searchIndex: search.searchIndex,
            jobScheduler: jobScheduler.scheduler,
            localBackupSettings: new BrowserSettingsStore(
                options.browserAPIs.storage.local,
                { prefix: 'localBackup.' },
            ),
            notifications,
            checkAuthorizedForAutoBackup: async () =>
                auth.remoteFunctions.isAuthorizedForFeature('backup'),
        }),
        storexHub: new StorexHubBackground({
            storageManager,
            localBrowserStorage: options.browserAPIs.storage.local,
            fetchPageData: options.fetchPageDataProcessor,
            storePageContent,
            addVisit: (visit) =>
                pages.addVisit(visit.normalizedUrl, visit.time),
            addBookmark: async (bookmark) => {
                if (
                    !(await bookmarks.storage.pageHasBookmark(
                        bookmark.normalizedUrl,
                    ))
                ) {
                    await bookmarks.addBookmark({
                        fullUrl: bookmark.normalizedUrl,
                        timestamp: bookmark.time,
                    })
                }
            },
            addTags: async (params) => {
                const existingTags = await tags.storage.fetchPageTags({
                    url: params.normalizedUrl,
                })
                await Promise.all(
                    params.tags.map(async (tag) => {
                        if (!existingTags.includes(tag)) {
                            await tags.addTagToPage({
                                url: params.fullUrl,
                                tag,
                            })
                        }
                    }),
                )
            },
            addToLists: async (params) => {
                const existingEntries = await customLists.storage.fetchListIdsByUrl(
                    params.normalizedUrl,
                )
                await Promise.all(
                    params.lists.map(async (listId) => {
                        if (!existingEntries.includes(listId)) {
                            await customLists.storage.insertPageToList({
                                listId,
                                pageUrl: params.normalizedUrl,
                                fullUrl: params.fullUrl,
                            })
                        }
                    }),
                )
            },
        }),
        // features: new FeatureOptIns(),
        featuresBeta: new FeaturesBeta(),
        pages,
        bgScript,
        contentScripts: new ContentScriptsBackground({
            webNavigation: options.browserAPIs.webNavigation,
            getURL: bindMethod(options.browserAPIs.runtime, 'getURL'),
            getTab: bindMethod(options.browserAPIs.tabs, 'get'),
            injectScriptInTab: (tabId, file) =>
                // Manifest v2:
                // options.browserAPIs.tabs.executeScript(tabId, file),
                // Manifest v3:
                options.browserAPIs.scripting.executeScript({
                    target: { tabId },
                    files: [file],
                }),
            browserAPIs: options.browserAPIs,
        }),
        inPageUI: new InPageUIBackground({
            queryTabs: bindMethod(options.browserAPIs.tabs, 'query'),
            contextMenuAPI: options.browserAPIs.contextMenus,
        }),
        copyPaster,
        activityStreams,
        userMessages,
        personalCloud,
        contentSharing,
        contentConversations: new ContentConversationsBackground({
            getServerStorage,
            servicesPromise: options.servicesPromise,
        }),
    }
}

export async function setupBackgroundModules(
    backgroundModules: BackgroundModules,
    storageManager: StorageManager,
) {
    backgroundModules.bgScript.setupWebExtAPIHandlers()

    setImportStateManager(
        new ImportStateManager({
            storageManager,
        }),
    )
    setupImportBackgroundModule({
        pages: backgroundModules.pages,
        tagsModule: backgroundModules.tags,
        customListsModule: backgroundModules.customLists,
        bookmarks: backgroundModules.bookmarks,
    })

    // TODO mv3: migrate web req APIs
    // backgroundModules.auth.setupRequestInterceptor()
    backgroundModules.auth.registerRemoteEmitter()
    backgroundModules.notifications.setupRemoteFunctions()
    backgroundModules.social.setupRemoteFunctions()
    backgroundModules.directLinking.setupRemoteFunctions()
    backgroundModules.search.setupRemoteFunctions()
    backgroundModules.activityIndicator.setupRemoteFunctions()
    backgroundModules.eventLog.setupRemoteFunctions()
    backgroundModules.backupModule.setBackendFromStorage()
    backgroundModules.backupModule.setupRemoteFunctions()
    backgroundModules.backupModule.startRecordingChangesIfNeeded()
    backgroundModules.bgScript.setupRemoteFunctions()
    backgroundModules.contentScripts.setupRemoteFunctions()
    backgroundModules.inPageUI.setupRemoteFunctions()
    backgroundModules.bookmarks.setupBookmarkListeners()
    backgroundModules.tabManagement.setupRemoteFunctions()
    backgroundModules.readwise.setupRemoteFunctions()
    backgroundModules.contentConversations.setupRemoteFunctions()
    backgroundModules.pages.setupRemoteFunctions()
    backgroundModules.syncSettings.setupRemoteFunctions()
    backgroundModules.backupModule.storage.setupChangeTracking()
    setupNotificationClickListener()

    // TODO mv3: migrate web req APIs
    // await backgroundModules.pdfBg.setupRequestInterceptors()
    await backgroundModules.analytics.setup()
    await backgroundModules.jobScheduler.setup()

    // Ensure log-in state gotten from FB + trigger share queue processing, but don't wait for it
    await backgroundModules.auth.authService.refreshUserInfo()
    await backgroundModules.contentSharing.setup()
    await backgroundModules.personalCloud.setup()
}

export function getBackgroundStorageModules(
    backgroundModules: BackgroundModules,
    __deprecatedModules: DeprecatedStorageModules,
): { [moduleName: string]: StorageModule } {
    return {
        pageFetchBacklog: __deprecatedModules.pageFetchBacklogStorage,
        annotations: backgroundModules.directLinking.annotationStorage,
        readwiseAction: __deprecatedModules.readwiseActionQueueStorage,
        notifications: backgroundModules.notifications.storage,
        customList: backgroundModules.customLists.storage,
        bookmarks: backgroundModules.bookmarks.storage,
        backup: backgroundModules.backupModule.storage,
        eventLog: backgroundModules.eventLog.storage,
        search: backgroundModules.search.storage,
        social: backgroundModules.social.storage,
        tags: backgroundModules.tags.storage,
        clientSyncLog: __deprecatedModules.clientSyncLogStorage,
        syncInfo: __deprecatedModules.syncInfoStorage,
        pages: backgroundModules.pages.storage,
        copyPaster: backgroundModules.copyPaster.storage,
        reader: backgroundModules.readable.storage,
        contentSharing: backgroundModules.contentSharing.storage,
        syncSettings: backgroundModules.syncSettings.storage,
        personalCloudActionQueue:
            backgroundModules.personalCloud.actionQueue.storage,
    }
}

export function getPersistentBackgroundStorageModules(
    backgroundModules: BackgroundModules,
): { [moduleName: string]: StorageModule } {
    return {
        pages: backgroundModules.pages.persistentStorage,
    }
}

export function registerBackgroundModuleCollections(options: {
    storageManager: StorageManager
    persistentStorageManager: StorageManager
    backgroundModules: BackgroundModules
}) {
    const deprecatedModules = new DeprecatedStorageModules(options)
    registerModuleMapCollections(
        options.storageManager.registry,
        getBackgroundStorageModules(
            options.backgroundModules,
            deprecatedModules,
        ),
    )
    registerModuleMapCollections(
        options.persistentStorageManager.registry,
        getPersistentBackgroundStorageModules(options.backgroundModules),
    )
}

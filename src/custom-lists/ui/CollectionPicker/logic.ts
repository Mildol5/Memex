import { UILogic, UIEvent, UIEventHandler, UIMutation } from 'ui-logic-core'
import { loadInitial } from 'src/util/ui-logic'
import type { Storage } from 'webextension-polyfill'
import type { TaskState } from 'ui-logic-core/lib/types'
import type { KeyEvent } from 'src/common-ui/GenericPicker/types'
import type {
    CollectionsSettings,
    RemoteCollectionsInterface,
} from 'src/custom-lists/background/types'
import type { ContentSharingInterface } from 'src/content-sharing/background/types'
import { validateSpaceName } from '@worldbrain/memex-common/lib/utils/space-name-validation'
import { pageActionAllowed } from 'src/util/subscriptions/storage'
import type {
    PageAnnotationsCacheEvents,
    PageAnnotationsCacheInterface,
    UnifiedList,
    UnifiedListType,
} from 'src/annotations/cache/types'
import { siftListsIntoCategories } from 'src/annotations/cache/utils'
import {
    initNormalizedState,
    NormalizedState,
    normalizedStateToArray,
} from '@worldbrain/memex-common/lib/common-ui/utils/normalized-state'
import { hydrateCacheForDashboard } from 'src/annotations/cache/utils'
import type { RemotePageActivityIndicatorInterface } from 'src/page-activity-indicator/background/types'
import type { AuthRemoteFunctionsInterface } from 'src/authentication/background/types'
import type { UserReference } from '@worldbrain/memex-common/lib/web-interface/types/users'
import { BrowserSettingsStore } from 'src/util/settings'

export type SpaceDisplayEntry<
    T extends UnifiedListType = UnifiedListType
> = UnifiedList<T>

export interface SpacePickerDependencies {
    localStorageAPI: Storage.LocalStorageArea
    shouldHydrateCacheOnInit?: boolean
    annotationsCache: PageAnnotationsCacheInterface
    createNewEntry: (name: string) => Promise<number>
    selectEntry: (
        listId: number,
        options?: { protectAnnotation?: boolean },
    ) => Promise<void>
    unselectEntry: (listId: number) => Promise<void>
    actOnAllTabs?: (listId: number) => Promise<void>
    /** Called when user keys Enter+Cmd/Ctrl in main text input */
    onSubmit?: () => void | Promise<void>
    initialSelectedListIds?: () => number[] | Promise<number[]>
    dashboardSelectedListId?: number
    children?: any
    filterMode?: boolean
    removeTooltipText?: string
    searchInputPlaceholder?: string
    onListShare?: (ids: { localListId: number; remoteListId: string }) => void
    onClickOutside?: React.MouseEventHandler
    authBG: AuthRemoteFunctionsInterface
    spacesBG: RemoteCollectionsInterface
    contentSharingBG: ContentSharingInterface
    pageActivityIndicatorBG: RemotePageActivityIndicatorInterface
    width?: string
    autoFocus?: boolean
    context?: string
    closePicker?: () => void
}

export type SpacePickerEvent = UIEvent<{
    setSearchInputRef: { ref: HTMLInputElement }
    searchInputChanged: { query: string; skipDebounce?: boolean }
    selectedEntryPress: { entry: number }
    resultEntryAllPress: { entry: SpaceDisplayEntry }
    newEntryAllPress: { entry: string }
    resultEntryPress: { entry: Pick<SpaceDisplayEntry, 'localId'> }
    resultEntryFocus: { entry: SpaceDisplayEntry; index: number }
    setListRemoteId: { localListId: number; remoteListId: string }
    toggleEntryContextMenu: { listId: number }
    updateContextMenuPosition: { x?: number; y?: number }
    renameList: { listId: number; name: string }
    deleteList: { listId: number }
    newEntryPress: { entry: string }
    keyPress: { event: KeyboardEvent }
    onKeyUp: { event: KeyboardEvent }
    focusInput: {}
}>

type EventHandler<EventName extends keyof SpacePickerEvent> = UIEventHandler<
    SpacePickerState,
    SpacePickerEvent,
    EventName
>

export interface SpacePickerState {
    query: string
    currentUser: UserReference | null
    newEntryName: string
    focusedListId: UnifiedList['unifiedId'] | null
    filteredListIds: UnifiedList['unifiedId'][] | null
    displayEntries: NormalizedState<SpaceDisplayEntry>
    selectedListIds: number[]
    contextMenuPositionX: number
    contextMenuPositionY: number
    contextMenuListId: number | null
    loadState: TaskState
    renameListErrorMessage: string | null
    allTabsButtonPressed?: number
}

const sortDisplayEntries = (selectedEntryIds: Set<number>) => (
    a: SpaceDisplayEntry,
    b: SpaceDisplayEntry,
): number =>
    (selectedEntryIds.has(b.localId) ? 1 : 0) -
    (selectedEntryIds.has(a.localId) ? 1 : 0)

/**
 * This exists as a temporary way to resolve local list IDs -> cache state data, delaying a lot of
 * space picker refactoring to move it to fully work on the cache.
 * TODO: Update all the events to use unifiedIds instead of localIds, and remove this function.
 */
const __getListDataByLocalId = (
    localId: number,
    { annotationsCache }: Pick<SpacePickerDependencies, 'annotationsCache'>,
    opts?: {
        source?: keyof SpacePickerEvent
        mustBeLocal?: boolean
    },
): SpaceDisplayEntry => {
    const listData = annotationsCache.getListByLocalId(localId)
    const source = opts?.source ? `for ${opts.source} ` : ''

    if (!listData) {
        throw new Error(`Specified list data ${source}could not be found`)
    }
    if (opts?.mustBeLocal && listData.localId == null) {
        throw new Error(
            `Specified list data ${source}could not be found locally`,
        )
    }
    return listData
}

export default class SpacePickerLogic extends UILogic<
    SpacePickerState,
    SpacePickerEvent
> {
    private searchInputRef?: HTMLInputElement
    private newTabKeys: KeyEvent[] = ['Enter', ',', 'Tab']
    private currentKeysPressed: KeyEvent[] = []
    private localStorage: BrowserSettingsStore<CollectionsSettings>

    /**
     * Exists to have a numerical representation for the `focusedListId` state according
     * to visual order, affording simple math on it.
     * -1 means nothing focused, other numbers correspond to focused index of `defaultEntries.allIds` state
     */
    private focusIndex = -1

    // For now, the only thing that needs to know if this has finished, is the tests.
    private _processingUpstreamOperation: Promise<void>

    constructor(protected dependencies: SpacePickerDependencies) {
        super()
        this.localStorage = new BrowserSettingsStore(
            dependencies.localStorageAPI,
            { prefix: 'custom-lists_' },
        )
    }

    get processingUpstreamOperation() {
        return this._processingUpstreamOperation
    }
    set processingUpstreamOperation(val) {
        this._processingUpstreamOperation = val
    }

    getInitialState = (): SpacePickerState => ({
        query: '',
        newEntryName: '',
        currentUser: null,
        focusedListId: null,
        displayEntries: initNormalizedState(),
        selectedListIds: [],
        filteredListIds: null,
        loadState: 'pristine',
        renameListErrorMessage: null,
        contextMenuListId: null,
        contextMenuPositionX: 0,
        contextMenuPositionY: 0,
    })

    private cacheListsSubscription: PageAnnotationsCacheEvents['newListsState']

    private initCacheListsSubscription = (
        currentUser?: UserReference,
    ): PageAnnotationsCacheEvents['newListsState'] => (nextLists) => {
        const { myLists, pageLinkLists } = siftListsIntoCategories(
            normalizedStateToArray(nextLists),
            currentUser,
        )
        // TODO: set page links state
        this.emitMutation({
            displayEntries: {
                $set: initNormalizedState({
                    seedData: myLists,
                    getId: (list) => list.unifiedId,
                }),
            },
        })
    }

    init: EventHandler<'init'> = async () => {
        await loadInitial(this, async () => {
            const user = await this.dependencies.authBG.getCurrentUser()
            const currentUser: UserReference = user
                ? { type: 'user-reference', id: user.id }
                : undefined
            this.emitMutation({ currentUser: { $set: currentUser ?? null } })
            this.cacheListsSubscription = this.initCacheListsSubscription(
                currentUser,
            )

            // TODO: Use these to sort the entries
            // const listSuggestionIds = await this.localStorage.get('suggestionIds')

            this.dependencies.annotationsCache.events.addListener(
                'newListsState',
                this.cacheListsSubscription,
            )

            if (this.dependencies.initialSelectedListIds) {
                const selectedListIds = await this.dependencies.initialSelectedListIds()
                this.emitMutation({
                    selectedListIds: { $set: selectedListIds },
                })
            }

            if (this.dependencies.shouldHydrateCacheOnInit) {
                await hydrateCacheForDashboard({
                    user: currentUser,
                    cache: this.dependencies.annotationsCache,
                    bgModules: {
                        customLists: this.dependencies.spacesBG,
                        contentSharing: this.dependencies.contentSharingBG,
                        pageActivityIndicator: this.dependencies
                            .pageActivityIndicatorBG,
                    },
                })
            } else {
                // Manually run subscription to seed state with any existing cache data
                this.cacheListsSubscription(
                    this.dependencies.annotationsCache.lists,
                )
            }
        })
    }

    cleanup: EventHandler<'cleanup'> = async ({}) => {
        if (this.cacheListsSubscription) {
            this.dependencies.annotationsCache.events.removeListener(
                'newListsState',
                this.cacheListsSubscription,
            )
        }
    }

    setSearchInputRef: EventHandler<'setSearchInputRef'> = ({
        event: { ref },
        previousState,
    }) => {
        this.searchInputRef = ref
    }

    focusInput: EventHandler<'focusInput'> = () => {
        this.searchInputRef?.focus()
    }

    onKeyUp: EventHandler<'onKeyUp'> = async ({ event: { event } }) => {
        let currentKeys = this.currentKeysPressed
        if (currentKeys.includes('Meta')) {
            this.currentKeysPressed = []
            return
        }
        currentKeys = currentKeys.filter((key) => key !== event.key)
        this.currentKeysPressed = currentKeys
    }

    keyPress: EventHandler<'keyPress'> = async ({
        event: { event },
        previousState,
    }) => {
        let currentKeys: KeyEvent[] = this.currentKeysPressed
        let keyPressed: any = event.key
        currentKeys.push(keyPressed)

        this.currentKeysPressed = currentKeys

        if (
            (currentKeys.includes('Enter') && currentKeys.includes('Meta')) ||
            (event.key === 'Enter' &&
                previousState.displayEntries.allIds.length === 0)
        ) {
            if (previousState.newEntryName !== '') {
                await this.newEntryPress({
                    previousState,
                    event: { entry: previousState.newEntryName },
                })
            }
            this.currentKeysPressed = []
            return
        }

        // if (event.key === 'Enter' && this.dependencies.onSubmit) {
        //     await this.dependencies.onSubmit()
        // }

        if (
            this.newTabKeys.includes(event.key as KeyEvent) &&
            previousState.displayEntries.allIds.length > 0
        ) {
            if (
                previousState.displayEntries.byId[previousState.focusedListId]
            ) {
                await this.resultEntryPress({
                    event: {
                        entry:
                            previousState.displayEntries.byId[
                                previousState.focusedListId
                            ],
                    },
                    previousState,
                })
                this.currentKeysPressed = []
                return
            }
        }

        if (event.key === 'ArrowUp') {
            this.setFocusedEntryIndex(this.focusIndex - 1, previousState)
            return
        }

        if (event.key === 'ArrowDown') {
            this.setFocusedEntryIndex(this.focusIndex + 1, previousState)
            return
        }
        if (event.key === 'Escape') {
            this.dependencies.closePicker()
        }
    }

    toggleEntryContextMenu: EventHandler<'toggleEntryContextMenu'> = async ({
        event,
        previousState,
    }) => {
        const nextListId =
            previousState.contextMenuListId === event.listId
                ? null
                : event.listId
        this.emitMutation({ contextMenuListId: { $set: nextListId } })
    }

    updateContextMenuPosition: EventHandler<
        'updateContextMenuPosition'
    > = async ({ event, previousState }) => {
        this.emitMutation({
            contextMenuPositionX: {
                $set:
                    event.x != null
                        ? event.x
                        : previousState.contextMenuPositionX,
            },
            contextMenuPositionY: {
                $set:
                    event.y != null
                        ? event.y
                        : previousState.contextMenuPositionY,
            },
        })
    }

    setListRemoteId: EventHandler<'setListRemoteId'> = async ({ event }) => {
        const listData = __getListDataByLocalId(
            event.localListId,
            this.dependencies,
            { source: 'setListRemoteId', mustBeLocal: true },
        )

        this.dependencies.onListShare(event)
        this.dependencies.annotationsCache.updateList({
            unifiedId: listData.unifiedId,
            remoteId: event.remoteListId,
        })
    }

    validateSpaceName(name: string, listIdToSkip?: number) {
        const validationResult = validateSpaceName(
            name,
            normalizedStateToArray(
                this.dependencies.annotationsCache.lists,
            ).map((entry) => ({
                id: entry.localId,
                name: entry.name,
            })),
            { listIdToSkip },
        )

        this.emitMutation({
            renameListErrorMessage: {
                $set:
                    validationResult.valid === false
                        ? validationResult.reason
                        : null,
            },
        })

        return validationResult
    }

    renameList: EventHandler<'renameList'> = async ({ event }) => {
        const newName = event.name.trim()
        const listData = __getListDataByLocalId(
            event.listId,
            this.dependencies,
            { source: 'renameList', mustBeLocal: true },
        )
        if (listData.name === newName) {
            return
        }
        const validationResult = this.validateSpaceName(newName, event.listId)
        if (validationResult.valid === false) {
            this.emitMutation({
                renameListErrorMessage: {
                    $set: validationResult.reason,
                },
            })
            return
        }

        this.dependencies.annotationsCache.updateList({
            unifiedId: listData.unifiedId,
            name: newName,
        })

        // NOTE: Done in SpaceContextMenuLogic
        // await this.dependencies.spacesBG.updateListName({
        //     id: event.listId,
        //     newName: event.name,
        //     oldName: previousState.displayEntries[stateEntryIndex].name,
        // })
    }

    deleteList: EventHandler<'deleteList'> = async ({ event }) => {
        const listData = __getListDataByLocalId(
            event.listId,
            this.dependencies,
            { source: 'deleteList', mustBeLocal: true },
        )
        this.dependencies.annotationsCache.removeList(listData)

        // NOTE: Done in SpaceContextMenuLogic
        // await this.dependencies.spacesBG.removeList({ id: event.listId })

        this.emitMutation({ contextMenuListId: { $set: null } })
    }

    searchInputChanged: EventHandler<'searchInputChanged'> = async ({
        event: { query },
        previousState,
    }) => {
        this.emitMutation({
            query: { $set: query },
            newEntryName: { $set: query },
        })

        if (!query || query === '') {
            this.emitMutation({ filteredListIds: { $set: null } })
        } else {
            this.querySpaces(query, previousState)
        }
    }

    /**
     * Searches for the term via the `queryEntries` function provided to the component
     */
    private querySpaces = (query: string, state: SpacePickerState) => {
        const distinctTerms = query.split(/\s+/).filter(Boolean)
        const doAllTermsMatch = (list: UnifiedList): boolean =>
            distinctTerms.reduce(
                (acc, term) =>
                    acc &&
                    list.name
                        .toLocaleLowerCase()
                        .includes(term.toLocaleLowerCase()),
                true,
            )

        const matchingEntryIds = normalizedStateToArray(state.displayEntries)
            .filter(doAllTermsMatch)
            .sort(sortDisplayEntries(new Set(state.selectedListIds)))
            .map((entry) => entry.unifiedId)

        this.emitMutation({ filteredListIds: { $set: matchingEntryIds } })
        this.maybeSetCreateEntryDisplay(query, state)

        if (matchingEntryIds.length > 0) {
            this.setFocusedEntryIndex(0, state)
        }
    }

    /**
     * If the term provided does not exist in the entry list, then set the new entry state to the term.
     * (the 'Add a new Space: ...' top entry)
     */
    private maybeSetCreateEntryDisplay = (
        input: string,
        state: SpacePickerState,
    ) => {
        const _input = input.trim()
        const alreadyExists = normalizedStateToArray(
            state.displayEntries,
        ).reduce((acc, entry) => acc || entry.name === _input, false)

        if (alreadyExists) {
            this.emitMutation({ newEntryName: { $set: '' } })
            // N.B. We update this focus index to this found entry, so that
            // enter keys will action it. But we don't emit that focus
            // to the user, because otherwise the style of the button changes
            // showing the tick and it might seem like it's already selected.
            this.setFocusedEntryIndex(0, state, false)
            return
        }

        const { valid } = this.validateSpaceName(_input)
        if (!valid) {
            return
        }
        this.emitMutation({ newEntryName: { $set: _input } })
        this.setFocusedEntryIndex(-1, state)
    }

    private setFocusedEntryIndex = (
        nextFocusIndex: number | null,
        state: Pick<SpacePickerState, 'displayEntries' | 'filteredListIds'>,
        emit = true,
    ) => {
        let entries = normalizedStateToArray(state.displayEntries)
        if (state.filteredListIds?.length) {
            entries = entries.filter((entry) =>
                state.filteredListIds.includes(entry.unifiedId),
            )
        }

        if (nextFocusIndex < -1 || nextFocusIndex >= entries.length) {
            return
        }

        this.focusIndex = nextFocusIndex ?? -1
        const focusEntryData = entries[nextFocusIndex]

        if (emit) {
            this.emitMutation({
                focusedListId: { $set: focusEntryData?.unifiedId ?? null },
            })
        }
    }

    selectedEntryPress: EventHandler<'selectedEntryPress'> = async ({
        event: { entry },
        previousState,
    }) => {
        this.emitMutation({
            selectedListIds: {
                $set: previousState.selectedListIds.filter(
                    (id) => id !== entry,
                ),
            },
        })

        await this.dependencies.unselectEntry(entry)
    }

    resultEntryPress: EventHandler<'resultEntryPress'> = async ({
        event: { entry },
        previousState,
    }) => {
        if (!(await pageActionAllowed())) {
            return
        }

        let nextState: SpacePickerState
        const listData = __getListDataByLocalId(
            entry.localId,
            this.dependencies,
            { source: 'resultEntryPress' },
        )

        // If we're going to unselect it
        try {
            if (previousState.selectedListIds.includes(entry.localId)) {
                const mutation: UIMutation<SpacePickerState> = {
                    selectedListIds: {
                        $set: previousState.selectedListIds.filter(
                            (id) => id !== entry.localId,
                        ),
                    },
                }

                this.emitMutation(mutation)
                nextState = this.withMutation(previousState, mutation)

                await this.dependencies.unselectEntry(entry.localId)
            } else {
                const prevDisplayEntriesIndex = previousState.displayEntries.allIds.indexOf(
                    listData.unifiedId,
                )
                const mutation: UIMutation<SpacePickerState> = {
                    selectedListIds: { $push: [entry.localId] },
                    displayEntries: {
                        allIds: {
                            // Reposition selected entry at start of display list
                            $set: [
                                previousState.displayEntries.allIds[
                                    listData.unifiedId
                                ],
                                ...previousState.displayEntries.allIds.slice(
                                    0,
                                    prevDisplayEntriesIndex,
                                ),
                                ...previousState.displayEntries.allIds.slice(
                                    prevDisplayEntriesIndex + 1,
                                ),
                            ],
                        },
                    },
                }

                this.emitMutation(mutation)
                nextState = this.withMutation(previousState, mutation)
                await this.dependencies.selectEntry(entry.localId)
            }
        } catch (e) {
            const mutation: UIMutation<SpacePickerState> = {
                selectedListIds: { $set: previousState.selectedListIds },
            }

            this.emitMutation(mutation)
            nextState = this.withMutation(previousState, mutation)
            throw new Error(e)
        }

        await this.searchInputChanged({
            event: { query: '' },
            previousState: nextState,
        })
    }

    resultEntryAllPress: EventHandler<'resultEntryAllPress'> = async ({
        event: { entry },
        previousState,
    }) => {
        if (!(await pageActionAllowed())) {
            return
        }
        this._processingUpstreamOperation = this.dependencies.actOnAllTabs(
            entry.localId,
        )
        const isAlreadySelected = previousState.selectedListIds.includes(
            entry.localId,
        )

        this.emitMutation({
            selectedListIds: {
                $set: isAlreadySelected
                    ? previousState.selectedListIds.filter(
                          (entryId) => entryId !== entry.localId,
                      )
                    : [...previousState.selectedListIds, entry.localId],
            },
            allTabsButtonPressed: { $set: entry.localId },
        })
    }

    private async createAndDisplayNewList(
        name: string,
        previousState: SpacePickerState,
    ): Promise<number> {
        const localListId = await this.dependencies.createNewEntry(name)

        this.dependencies.annotationsCache.addList({
            name,
            localId: localListId,
            remoteId: null,
            hasRemoteAnnotationsToLoad: false,
            type: 'user-list',
            unifiedAnnotationIds: [],
            creator: previousState.currentUser ?? undefined,
        })

        this.emitMutation({
            query: { $set: '' },
            newEntryName: { $set: '' },
            selectedListIds: { $push: [localListId] },
        })
        this.setFocusedEntryIndex(0, previousState)
        return localListId
    }

    newEntryPress: EventHandler<'newEntryPress'> = async ({
        event: { entry },
        previousState,
    }) => {
        if (!(await pageActionAllowed())) {
            return
        }

        // NOTE: This is here as the enter press event from the context menu to confirm a space rename
        //   was also bubbling up into the space menu and being interpretted as a new space confirmation.
        //   Resulting in both a new space create + existing space rename. This is a hack to prevent that.
        if (previousState.contextMenuListId != null) {
            return
        }

        const { valid } = this.validateSpaceName(entry)
        if (!valid) {
            return
        }
        const listId = await this.createAndDisplayNewList(entry, previousState)
        await this.dependencies.selectEntry(listId)
    }

    newEntryAllPress: EventHandler<'newEntryAllPress'> = async ({
        event: { entry },
        previousState,
    }) => {
        if (!(await pageActionAllowed())) {
            return
        }

        const newId = await this.createAndDisplayNewList(entry, previousState)
        this._processingUpstreamOperation = this.dependencies.actOnAllTabs(
            newId,
        )
    }

    resultEntryFocus: EventHandler<'resultEntryFocus'> = ({
        event: { entry, index },
        previousState,
    }) => {
        this.setFocusedEntryIndex(index, previousState)
    }
}

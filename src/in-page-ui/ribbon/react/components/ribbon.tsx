import React, { Component, createRef, KeyboardEventHandler } from 'react'
import qs from 'query-string'
import styled, { createGlobalStyle, css } from 'styled-components'
import browser from 'webextension-polyfill'

import extractQueryFilters from 'src/util/nlp-time-filter'
import {
    shortcuts,
    ShortcutElData,
} from 'src/options/settings/keyboard-shortcuts'
import { getKeyboardShortcutsState } from 'src/in-page-ui/keyboard-shortcuts/content_script/detection'
import type {
    Shortcut,
    BaseKeyboardShortcuts,
} from 'src/in-page-ui/keyboard-shortcuts/types'
import { HighlightInteractionsInterface } from 'src/highlighting/types'
import { RibbonSubcomponentProps, RibbonHighlightsProps } from './types'
import CollectionPicker from 'src/custom-lists/ui/CollectionPicker'
import AnnotationCreate from 'src/annotations/components/AnnotationCreate'
import BlurredSidebarOverlay from 'src/in-page-ui/sidebar/react/components/blurred-overlay'
import QuickTutorial from '@worldbrain/memex-common/lib/editor/components/QuickTutorial'
import { FeedActivityDot } from 'src/activity-indicator/ui'
import Icon from '@worldbrain/memex-common/lib/common-ui/components/icon'
import * as icons from 'src/common-ui/components/design-library/icons'
import type { ListDetailsGetter } from 'src/annotations/types'
import FeedPanel from './feed-panel'
import TextField from '@worldbrain/memex-common/lib/common-ui/components/text-field'
import { addUrlToBlacklist } from 'src/blacklist/utils'
import { PopoutBox } from '@worldbrain/memex-common/lib/common-ui/components/popout-box'
import { TooltipBox } from '@worldbrain/memex-common/lib/common-ui/components/tooltip-box'
import KeyboardShortcuts from '@worldbrain/memex-common/lib/common-ui/components/keyboard-shortcuts'
import { PrimaryAction } from '@worldbrain/memex-common/lib/common-ui/components/PrimaryAction'
import { HexAlphaColorPicker, HexColorPicker } from 'react-colorful'

export interface Props extends RibbonSubcomponentProps {
    getRemoteFunction: (name: string) => (...args: any[]) => Promise<any>
    setRef?: (el: HTMLElement) => void
    isExpanded: boolean
    isRibbonEnabled: boolean
    shortcutsData: ShortcutElData[]
    showExtraButtons: boolean
    showTutorial: boolean
    getListDetailsById: ListDetailsGetter
    toggleShowExtraButtons: () => void
    toggleShowTutorial: () => void
    handleRibbonToggle: () => void
    handleRemoveRibbon: () => void
    highlighter: Pick<HighlightInteractionsInterface, 'removeHighlights'>
    hideOnMouseLeave?: boolean
    toggleFeed: () => void
    showFeed: boolean
}

interface State {
    shortcutsReady: boolean
    blockListValue: string
    showColorPicker: boolean
    pickerColor: string
}

export default class Ribbon extends Component<Props, State> {
    static defaultProps: Pick<Props, 'shortcutsData'> = {
        shortcutsData: shortcuts,
    }

    private keyboardShortcuts: BaseKeyboardShortcuts
    private shortcutsData: Map<string, ShortcutElData>
    private openOverviewTabRPC
    private openOptionsTabRPC
    getFeedInfo
    settingsButtonRef
    private annotationCreateRef // TODO: Figure out how to properly type refs to onClickOutside HOCs

    private spacePickerRef = createRef<HTMLDivElement>()
    private tutorialButtonRef = createRef<HTMLDivElement>()
    private feedButtonRef = createRef<HTMLDivElement>()
    private sidebarButtonRef = createRef<HTMLDivElement>()
    private changeColorRef = createRef<HTMLDivElement>()
    private colorPickerField = createRef<HTMLInputElement>()

    state: State = {
        shortcutsReady: false,
        blockListValue: this.getDomain(window.location.href),
        showColorPicker: false,
        pickerColor: '',
    }

    constructor(props: Props) {
        super(props)
        this.shortcutsData = new Map(
            props.shortcutsData.map((s) => [s.name, s]) as [
                string,
                ShortcutElData,
            ][],
        )
        this.openOverviewTabRPC = this.props.getRemoteFunction(
            'openOverviewTab',
        )
        this.openOptionsTabRPC = this.props.getRemoteFunction('openOptionsTab')
        this.getFeedInfo = this.props.getRemoteFunction('getFeedInfo')

        this.settingsButtonRef = createRef<HTMLDivElement>()
    }

    async componentDidMount() {
        this.keyboardShortcuts = await getKeyboardShortcutsState()
        this.setState(() => ({ shortcutsReady: true }))
        this.initialiseHighlightColor()
    }

    async initialiseHighlightColor() {
        const highlightColor = await browser.storage.local.get(
            '@highlight-colors',
        )

        let highlightColorNew = highlightColor['@highlight-colors']

        this.setState({
            pickerColor: highlightColorNew,
        })
    }

    updatePickerColor(value) {
        this.setState({
            pickerColor: value,
        })

        let highlights: HTMLCollection = document.getElementsByTagName(
            'hypothesis-highlight',
        )

        for (let item of highlights) {
            item.setAttribute('style', `background-color:${value};`)
        }
    }

    async saveHighlightColor() {
        await browser.storage.local.set({
            '@highlight-colors': this.state.pickerColor,
        })
    }

    focusCreateForm = () => this.annotationCreateRef?.getInstance()?.focus()

    private handleSearchEnterPress: KeyboardEventHandler<HTMLInputElement> = (
        event,
    ) => {
        const queryFilters = extractQueryFilters(this.props.search.searchValue)
        const queryParams = qs.stringify(queryFilters)

        this.openOverviewTabRPC(queryParams)
        this.props.search.setShowSearchBox(false)
        this.props.search.setSearchValue('')
    }

    private handleCommentIconBtnClick = (event) => {
        if (event.shiftKey) {
            if (this.props.sidebar.isSidebarOpen) {
                this.props.sidebar.setShowSidebarCommentBox(true)
                return
            }
            this.props.commentBox.setShowCommentBox(
                !this.props.commentBox.showCommentBox,
            )
        } else {
            this.props.sidebar.openSidebar({})
        }
    }

    private getTooltipText(name: string): JSX.Element | string {
        const elData = this.shortcutsData.get(name)
        const short: Shortcut = this.keyboardShortcuts[name]

        if (!elData) {
            return ''
        }

        let source = elData.tooltip

        if (['createBookmark', 'toggleSidebar'].includes(name)) {
            source = this.props.bookmark.isBookmarked
                ? elData.toggleOff
                : elData.toggleOn
        }

        return short.shortcut && short.enabled ? (
            <TooltipContent>
                {source}
                {<KeyboardShortcuts keys={short.shortcut.split('+')} />}
            </TooltipContent>
        ) : (
            source
        )
    }

    private hideListPicker = () => {
        this.props.lists.setShowListsPicker(false)
    }

    private renderSpacePicker() {
        if (!this.props.lists.showListsPicker) {
            return
        }

        return (
            <PopoutBox
                targetElementRef={this.spacePickerRef.current}
                placement={'left-start'}
                offsetX={10}
                closeComponent={this.hideListPicker}
                bigClosingScreen
            >
                <CollectionPicker
                    {...this.props.lists}
                    spacesBG={this.props.spacesBG}
                    contentSharingBG={this.props.contentSharingBG}
                    actOnAllTabs={this.props.lists.listAllTabs}
                    initialSelectedListIds={
                        this.props.lists.fetchInitialListSelections
                    }
                />
            </PopoutBox>
        )
    }

    private renderTutorial() {
        if (!this.props.showTutorial) {
            return
        }

        return (
            <PopoutBox
                targetElementRef={this.tutorialButtonRef.current}
                placement={'left-start'}
                offsetX={10}
                closeComponent={this.props.toggleShowTutorial}
                width={'440px'}
                bigClosingScreen
            >
                <QuickTutorial
                    getKeyboardShortcutsState={getKeyboardShortcutsState}
                    onSettingsClick={() => this.openOptionsTabRPC('settings')}
                />
            </PopoutBox>
        )
    }

    private renderColorPicker() {
        if (!this.state.showColorPicker) {
            return
        }

        return (
            <ColorPickerContainer>
                <PickerButtonTopBar>
                    <PrimaryAction
                        size={'small'}
                        icon={'arrowLeft'}
                        label={'Go back'}
                        type={'tertiary'}
                        onClick={() =>
                            this.setState({
                                showColorPicker: false,
                            })
                        }
                    />
                    <PrimaryAction
                        size={'small'}
                        label={'Save Color'}
                        type={'primary'}
                        onClick={() => this.saveHighlightColor()}
                    />
                </PickerButtonTopBar>
                <TextField
                    value={this.state.pickerColor}
                    onChange={(event) =>
                        this.updatePickerColor(
                            (event.target as HTMLInputElement).value,
                        )
                    }
                    componentRef={this.colorPickerField}
                />
                <HexPickerContainer>
                    <HexAlphaColorPicker
                        color={this.state.pickerColor}
                        onChange={(value) => {
                            this.setState({
                                pickerColor: value,
                            })
                            this.updatePickerColor(value)
                        }}
                        id={'hextest'}
                    />
                </HexPickerContainer>
                {/* <HexAlphaColorPicker color={this.state.pickerColor} /> */}
                {/* <RgbColorPicker color={'r: 1, g: 1, b: 1; a: 1'} /> */}
                {/* <SketchPicker color={this.state.pickerColor} /> */}
            </ColorPickerContainer>
        )
    }

    private whichFeed = () => {
        if (process.env.NODE_ENV === 'production') {
            return 'https://memex.social/feed'
        } else {
            return 'https://staging.memex.social/feed'
        }
    }

    renderFeedInfo() {
        if (!this.props.showFeed) {
            return
        }

        return (
            <PopoutBox
                targetElementRef={this.feedButtonRef.current}
                placement={'left-start'}
                offsetX={0}
                offsetY={-15}
                width={'600px'}
                closeComponent={() => this.props.toggleFeed()}
                bigClosingScreen
            >
                <FeedPanel closePanel={() => this.props.toggleFeed()}>
                    <FeedContainer>
                        <TitleContainer>
                            <Icon
                                heightAndWidth="30px"
                                filePath="feed"
                                hoverOff
                            />
                            <TitleContent>
                                <SectionTitle>Activity Feed</SectionTitle>
                                <SectionDescription>
                                    Updates from Spaces you follow or
                                    conversation you participate in
                                </SectionDescription>
                            </TitleContent>
                        </TitleContainer>
                        <FeedFrame src={this.whichFeed()} />
                    </FeedContainer>
                </FeedPanel>
            </PopoutBox>
        )
    }

    private getDomain(url: string) {
        const withoutProtocol = url.split('//')[1]

        if (withoutProtocol.startsWith('www.')) {
            return withoutProtocol.split('www.')[1].split('/')[0]
        } else {
            return withoutProtocol.split('/')[0]
        }
    }

    private renderExtraButtons() {
        if (!this.props.showExtraButtons) {
            return
        }

        return (
            <PopoutBox
                targetElementRef={this.settingsButtonRef.current}
                placement={'left-start'}
                offsetX={10}
                width={!this.state.showColorPicker ? '360px' : 'unset'}
                closeComponent={() => this.props.toggleShowExtraButtons()}
            >
                <GlobalStyle />
                {this.state.showColorPicker ? (
                    this.renderColorPicker()
                ) : (
                    <ExtraButtonContainer>
                        <BlockListArea>
                            <BlockListTitleArea>
                                <BlockListTitleContent>
                                    <Icon
                                        filePath={'block'}
                                        heightAndWidth="16px"
                                        hoverOff
                                    />
                                    <InfoText>
                                        Disable Ribbon on this site
                                    </InfoText>
                                </BlockListTitleContent>
                                <TooltipBox
                                    tooltipText={'Modify existing block list'}
                                    placement={'bottom'}
                                >
                                    <Icon
                                        onClick={() =>
                                            this.openOptionsTabRPC('blocklist')
                                        }
                                        filePath={'settings'}
                                        heightAndWidth={'18px'}
                                        color={'purple'}
                                    />
                                </TooltipBox>
                            </BlockListTitleArea>
                            <TextBoxArea>
                                <TextField
                                    value={this.state.blockListValue}
                                    onChange={(event) =>
                                        this.setState({
                                            blockListValue: (event.target as HTMLInputElement)
                                                .value,
                                        })
                                    }
                                    width="fill-available"
                                />
                                <TooltipBox
                                    tooltipText={
                                        'Add this entry to the block list'
                                    }
                                    placement={'bottom'}
                                >
                                    <Icon
                                        heightAndWidth="22px"
                                        filePath="plus"
                                        color="purple"
                                        onClick={async () => {
                                            this.setState({
                                                blockListValue:
                                                    'Added to block list',
                                            })
                                            await addUrlToBlacklist(
                                                this.state.blockListValue,
                                            )
                                            setTimeout(
                                                () =>
                                                    this.props.handleRemoveRibbon(),
                                                2000,
                                            )
                                        }}
                                    />
                                </TooltipBox>
                            </TextBoxArea>
                        </BlockListArea>
                        <ExtraButtonRow
                            onClick={() => {
                                this.props.handleRibbonToggle()
                                this.props.sidebar.closeSidebar()
                            }}
                        >
                            <Icon
                                filePath={icons.quickActionRibbon}
                                heightAndWidth="22px"
                                hoverOff
                            />
                            {this.props.isRibbonEnabled ? (
                                <InfoText>Disable Ribbon</InfoText>
                            ) : (
                                <InfoText>Enable Ribbon</InfoText>
                            )}
                        </ExtraButtonRow>
                        <ExtraButtonRow
                            onClick={
                                this.props.highlights.handleHighlightsToggle
                            }
                        >
                            <Icon
                                filePath={'highlight'}
                                heightAndWidth="22px"
                                hoverOff
                            />
                            {this.props.highlights.areHighlightsEnabled ? (
                                <InfoText>Hide Highlights</InfoText>
                            ) : (
                                <InfoText>Show Highlights</InfoText>
                            )}
                            <ButtonPositioning>
                                <PrimaryAction
                                    label={'Change Color'}
                                    size={'small'}
                                    type={'primary'}
                                    onClick={(event) => {
                                        this.setState({
                                            showColorPicker: true,
                                        })
                                        event.stopPropagation()
                                    }}
                                    innerRef={this.changeColorRef}
                                />
                            </ButtonPositioning>
                        </ExtraButtonRow>

                        <ExtraButtonRow
                            onClick={this.props.tooltip.handleTooltipToggle}
                        >
                            <Icon
                                filePath={
                                    this.props.tooltip.isTooltipEnabled
                                        ? icons.tooltipOn
                                        : icons.tooltipOff
                                }
                                heightAndWidth="22px"
                                hoverOff
                            />
                            {this.props.isRibbonEnabled ? (
                                <InfoText>Hide Highlighter Tooltip</InfoText>
                            ) : (
                                <InfoText>Show Highlighter Tooltip</InfoText>
                            )}
                        </ExtraButtonRow>
                        <ExtraButtonRow
                            onClick={() =>
                                window.open('https://worldbrain.io/tutorials')
                            }
                        >
                            <Icon
                                filePath={icons.helpIcon}
                                heightAndWidth="22px"
                                hoverOff
                            />
                            <InfoText>Tutorials</InfoText>
                        </ExtraButtonRow>
                        <ExtraButtonRow
                            onClick={() => this.openOptionsTabRPC('settings')}
                        >
                            <Icon
                                filePath={icons.settings}
                                heightAndWidth="22px"
                                hoverOff
                            />
                            <InfoText>Settings</InfoText>
                        </ExtraButtonRow>
                        <ExtraButtonRow
                            onClick={() =>
                                window.open('https://worldbrain.io/feedback')
                            }
                        >
                            <Icon
                                filePath={icons.sadFace}
                                heightAndWidth="22px"
                                hoverOff
                            />
                            <InfoText>Feature Requests & Bugs</InfoText>
                        </ExtraButtonRow>
                    </ExtraButtonContainer>
                )}
            </PopoutBox>
        )
    }

    renderCommentBox() {
        if (!this.props.commentBox.showCommentBox) {
            return
        }

        return (
            <PopoutBox
                targetElementRef={this.sidebarButtonRef.current}
                placement={'left-start'}
                offsetX={10}
                bigClosingScreen
            >
                <CommentBoxContainer
                    hasComment={this.props.commentBox.commentText.length > 0}
                >
                    <AnnotationCreate
                        ref={(ref) => (this.annotationCreateRef = ref)}
                        hide={() =>
                            this.props.commentBox.setShowCommentBox(false)
                        }
                        onSave={this.props.commentBox.saveComment}
                        onCancel={this.props.commentBox.cancelComment}
                        onCommentChange={this.props.commentBox.changeComment}
                        comment={this.props.commentBox.commentText}
                        lists={this.props.commentBox.lists}
                        getListDetailsById={this.props.getListDetailsById}
                        createNewList={this.props.lists.createNewEntry}
                        addPageToList={this.props.lists.selectEntry}
                        removePageFromList={this.props.lists.unselectEntry}
                        isRibbonCommentBox
                        spacesBG={this.props.spacesBG}
                        contentSharingBG={this.props.contentSharingBG}
                        autoFocus
                    />
                </CommentBoxContainer>
            </PopoutBox>
        )
    }

    render() {
        if (!this.state.shortcutsReady) {
            return false
        }
        return (
            <>
                <OuterRibbon
                    isPeeking={this.props.isExpanded}
                    isSidebarOpen={this.props.sidebar.isSidebarOpen}
                >
                    <InnerRibbon
                        ref={this.props.setRef}
                        isPeeking={this.props.isExpanded}
                        isSidebarOpen={this.props.sidebar.isSidebarOpen}
                    >
                        {(this.props.isExpanded ||
                            this.props.sidebar.isSidebarOpen) && (
                            <React.Fragment>
                                <UpperPart>
                                    <TooltipBox
                                        targetElementRef={
                                            this.feedButtonRef.current
                                        }
                                        tooltipText={'Show Feed'}
                                        placement={'left'}
                                        offsetX={0}
                                    >
                                        <FeedIndicatorBox
                                            isSidebarOpen={
                                                this.props.sidebar.isSidebarOpen
                                            }
                                            onClick={() =>
                                                this.props.toggleFeed()
                                            }
                                            ref={this.feedButtonRef}
                                        >
                                            <FeedActivityDot
                                                key="activity-feed-indicator"
                                                {...this.props
                                                    .activityIndicator}
                                            />
                                        </FeedIndicatorBox>
                                    </TooltipBox>
                                    <HorizontalLine
                                        sidebaropen={
                                            this.props.sidebar.isSidebarOpen
                                        }
                                    />
                                    <PageAction>
                                        <TooltipBox
                                            targetElementRef={
                                                this.spacePickerRef.current
                                            }
                                            tooltipText={this.getTooltipText(
                                                'createBookmark',
                                            )}
                                            placement={'left'}
                                            offsetX={10}
                                        >
                                            <Icon
                                                onClick={() =>
                                                    this.props.bookmark.toggleBookmark()
                                                }
                                                color={
                                                    this.props.bookmark
                                                        .isBookmarked
                                                        ? 'purple'
                                                        : 'greyScale9'
                                                }
                                                heightAndWidth="22px"
                                                filePath={
                                                    this.props.bookmark
                                                        .isBookmarked
                                                        ? icons.heartFull
                                                        : icons.heartEmpty
                                                }
                                            />
                                        </TooltipBox>
                                        <TooltipBox
                                            targetElementRef={
                                                this.spacePickerRef.current
                                            }
                                            tooltipText={this.getTooltipText(
                                                'addToCollection',
                                            )}
                                            placement={'left'}
                                            offsetX={10}
                                        >
                                            <Icon
                                                onClick={() =>
                                                    this.props.lists.setShowListsPicker(
                                                        !this.props.lists
                                                            .showListsPicker,
                                                    )
                                                }
                                                color={
                                                    this.props.lists.pageListIds
                                                        .length > 0
                                                        ? 'purple'
                                                        : 'greyScale9'
                                                }
                                                heightAndWidth="22px"
                                                filePath={
                                                    this.props.lists.pageListIds
                                                        .length > 0
                                                        ? icons.collectionsFull
                                                        : icons.collectionsEmpty
                                                }
                                                containerRef={
                                                    this.spacePickerRef
                                                }
                                            />
                                        </TooltipBox>
                                        {!this.props.sidebar.isSidebarOpen && (
                                            <TooltipBox
                                                targetElementRef={
                                                    this.sidebarButtonRef
                                                        .current
                                                }
                                                tooltipText={this.getTooltipText(
                                                    'toggleSidebar',
                                                )}
                                                placement={'left'}
                                                offsetX={10}
                                            >
                                                <Icon
                                                    onClick={(e) =>
                                                        this.handleCommentIconBtnClick(
                                                            e,
                                                        )
                                                    }
                                                    color={'greyScale9'}
                                                    heightAndWidth="22px"
                                                    filePath={
                                                        this.props.commentBox
                                                            .isCommentSaved
                                                            ? icons.saveIcon
                                                            : // : this.props.hasAnnotations
                                                              // ? icons.commentFull
                                                              icons.commentEmpty
                                                    }
                                                    containerRef={
                                                        this.sidebarButtonRef
                                                    }
                                                />
                                            </TooltipBox>
                                        )}
                                        <TooltipBox
                                            tooltipText={this.getTooltipText(
                                                'openDashboard',
                                            )}
                                            placement={'left'}
                                            offsetX={10}
                                        >
                                            <Icon
                                                onClick={() =>
                                                    this.openOverviewTabRPC()
                                                }
                                                color={'greyScale9'}
                                                heightAndWidth="22px"
                                                filePath={icons.searchIcon}
                                            />
                                        </TooltipBox>
                                    </PageAction>
                                </UpperPart>
                                {!this.props.sidebar.isSidebarOpen && (
                                    <HorizontalLine
                                        sidebaropen={
                                            this.props.sidebar.isSidebarOpen
                                        }
                                    />
                                )}
                                <BottomSection
                                    sidebaropen={
                                        this.props.sidebar.isSidebarOpen
                                    }
                                >
                                    <Icon
                                        onClick={() =>
                                            this.props.toggleShowExtraButtons()
                                        }
                                        color={'darkText'}
                                        heightAndWidth="22px"
                                        filePath={icons.settings}
                                        containerRef={this.settingsButtonRef}
                                    />
                                    <TooltipBox
                                        targetElementRef={
                                            this.spacePickerRef.current
                                        }
                                        tooltipText={
                                            <span>
                                                Keyboard Shortcuts
                                                <br />
                                                and Help
                                            </span>
                                        }
                                        placement={'left'}
                                        offsetX={10}
                                    >
                                        <Icon
                                            onClick={() =>
                                                this.props.toggleShowTutorial()
                                            }
                                            color={'darkText'}
                                            heightAndWidth="22px"
                                            filePath={icons.helpIcon}
                                            containerRef={
                                                this.tutorialButtonRef
                                            }
                                        />
                                    </TooltipBox>
                                    {!this.props.sidebar.isSidebarOpen && (
                                        <TooltipBox
                                            tooltipText={
                                                <span>
                                                    Close sidebar this once.
                                                    <br />
                                                    <SubText>
                                                        Shift+Click to disable.
                                                    </SubText>
                                                </span>
                                            }
                                            placement={'left'}
                                            offsetX={10}
                                        >
                                            <Icon
                                                onClick={(event) => {
                                                    if (
                                                        event.shiftKey &&
                                                        this.props
                                                            .isRibbonEnabled
                                                    ) {
                                                        this.props.handleRibbonToggle()
                                                    } else {
                                                        this.props.handleRemoveRibbon()
                                                    }
                                                }}
                                                color={'darkText'}
                                                heightAndWidth="22px"
                                                filePath={icons.removeX}
                                            />
                                        </TooltipBox>
                                    )}
                                </BottomSection>
                            </React.Fragment>
                        )}
                        {this.renderSpacePicker()}
                        {this.renderTutorial()}
                        {this.renderFeedInfo()}
                        {this.renderCommentBox()}
                    </InnerRibbon>
                </OuterRibbon>
                {this.renderExtraButtons()}
            </>
        )
    }
}

const ButtonPositioning = styled.div`
    position: absolute;
    right: 15px;
`

const PickerButtonTopBar = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: fill-available;
`

const ExtraButtonContainer = styled.div`
    padding: 10px;
`
const ColorPickerContainer = styled.div`
    display: flex;
    flex-direction: column;
    grid-gap: 10px;
    padding: 15px;
`

const HexPickerContainer = styled.div`
    height: 200px;
    width: 200px;

    > * {
        width: initial;
    }
`

const TooltipContent = styled.div`
    display: flex;
    align-items: center;
    grid-gap: 10px;
`

const BlockListArea = styled.div`
    border-bottom: 1px solid ${(props) => props.theme.colors.lightHover};
    display: flex;
    flex-direction: column;
    grid-gap: 5px;
    align-items: flex-start;
    margin-bottom: 5px;
    padding: 5px 10px 10px 0;
`

const BlockListTitleArea = styled.div`
    display: flex;
    align-items: center;
    grid-gap: 10px;
    padding: 0px 0px 5px 10px;
    justify-content: space-between;
    width: fill-available;
    z-index: 1;
`

const BlockListTitleContent = styled.div`
    display: flex;
    justify-content: flex-start;
    grid-gap: 10px;
    align-items: center;
`

const TextBoxArea = styled.div`
    display: flex;
    align-items: center;
    padding: 0 0 0 10px;
    width: fill-available;
    grid-gap: 5px;
`

const UpperPart = styled.div``

const BottomSection = styled.div<{ sidebaropen: boolean }>`
    align-self: center;
    display: flex;
    flex-direction: column;
    grid-gap: 10px;
    justify-content: center;
    align-items: center;
    padding: 8px 0px;
`

const OuterRibbon = styled.div<{ isPeeking; isSidebarOpen }>`
    flex-direction: column;
    justify-content: center;
    align-self: center;
    width: 24px;
    height: 400px;
    display: flex;
    /* box-shadow: -1px 2px 5px 0px rgba(0, 0, 0, 0.16); */
    line-height: normal;
    text-align: start;
    align-items: center;
    background: transparent;
    z-index: 2147483644;
    animation: slide-in ease-out;
    animation-duration: 0.05s;

    ${(props) =>
        props.isPeeking &&
        css`
            display: flex;
            align-items: flex-end;
            width: 44px;
            padding-right: 25px;
        `}

    ${(props) =>
        props.isSidebarOpen &&
        css`
            display: none;
            box-shadow: none;
            justify-content: center;
            height: 105vh;
            width: 40px;
            border-left: 1px solid ${(props) => props.theme.colors.lineGrey};
            align-items: flex-start;
            padding: 0 5px;
            background: ${(props) => props.theme.colors.backgroundColor};

            & .removeSidebar {
                visibility: hidden;
                display: none;
            }
        `}

        @keyframes slide-in {
        0% {
            right: -600px;
            opacity: 0%;
        }
        100% {
            right: 0px;
            opacity: 100%;
        }
    }
`

const InnerRibbon = styled.div<{ isPeeking; isSidebarOpen }>`
    position: absolute;
    top: 20px;
    width: 44px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 5px 0;
    display: none;
    background: ${(props) => props.theme.colors.backgroundColorDarker};
    border: 1px solid ${(props) => props.theme.colors.lineGrey};

    ${(props) =>
        props.isPeeking &&
        css`
            border-radius: 8px;
            display: flex;
            box-shadow: 0px 22px 26px 18px rgba(0, 0, 0, 0.03);
            background: ${(props) => props.theme.colors.backgroundColorDarker};
        }
    `}

    ${(props) =>
        props.isSidebarOpen &&
        css`
            display: none;
            box-shadow: none;
            height: 90%;
            top: 0px;
            width: 40px;
            justify-content: space-between;
            padding-top: 17px;
            background: transparent;
            border: none;
            align-items: center;
            background: ${(props) => props.theme.colors.backgroundColor};
        `}
`

const ExtraButtonRow = styled.div`
    height: 40px;
    display: flex;
    grid-gap: 10px;
    align-items: center;
    width: fill-available;
    cursor: pointer;
    border-radius: 3px;
    padding: 0 15px;
    position: relative;

    &:hover {
        outline: 1px solid ${(props) => props.theme.colors.lightHover};
    }
`

const HorizontalLine = styled.div<{ sidebaropen: boolean }>`
    width: 100%;
    margin: 5px 0;
    height: 1px;
    background-color: ${(props) => props.theme.colors.lightHover};
`

const PageAction = styled.div`
    display: grid;
    grid-gap: 10px;
    grid-auto-flow: row;
    align-items: center;
    justify-content: center;
    padding: 10px;
`

const SubText = styled.span`
    font-size: 10px;
`

const FeedIndicatorBox = styled.div<{ isSidebarOpen: boolean }>`
    display: flex;
    justify-content: center;
    margin: ${(props) => (props.isSidebarOpen ? '2px 0 15px' : '10px 0')};
`

const InfoText = styled.div`
    color: ${(props) => props.theme.colors.normalText};
    font-size: 14px;
    font-weight: 400;
`

const FeedFrame = styled.iframe`
    width: fill-available;
    height: 600px;
    border: none;
    border-radius: 10px;
`

const FeedContainer = styled.div`
    display: flex;
    width: fill-available;
    height: 580px;
    justify-content: flex-start;
    align-items: center;
    flex-direction: column;
    grid-gap: 20px;
    padding-top: 20px;
    max-width: 800px;
    background: ${(props) => props.theme.colors.backgroundColor};
    border-radius: 10px;
`

const TitleContainer = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    grid-gap: 15px;
    width: fill-available;
    padding: 0 20px 20px 20px;
    border-bottom: 1px solid ${(props) => props.theme.colors.lightHover};
`
const TitleContent = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    grid-gap: 10px;
    width: fill-available;
`

const SectionTitle = styled.div`
    color: ${(props) => props.theme.colors.normalText};
    font-size: 20px;
    font-weight: bold;
`
const SectionDescription = styled.div`
    color: ${(props) => props.theme.colors.greyScale8};
    font-size: 14px;
    font-weight: 300;
`
const CommentBoxContainer = styled.div<{ hasComment: boolean }>`
    padding: 5px 5px;
    width: 350px;

    & > div {
        margin: 0;

        & > div:first-child {
            margin: ${(props) => (props.hasComment ? '0 0 10px 0' : '0')};
        }
    }
`

export const GlobalStyle = createGlobalStyle`

.react-colorful {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 200px;
    height: 200px;
    user-select: none;
    cursor: default;
  }
  
  .react-colorful__saturation {
    position: relative;
    flex-grow: 1;
    border-color: transparent; /* Fixes https://github.com/omgovich/react-colorful/issues/139 */
    border-bottom: 12px solid #000;
    border-radius: 8px 8px 0 0;
    background-image: linear-gradient(to top, #000, rgba(0, 0, 0, 0)),
      linear-gradient(to right, #fff, rgba(255, 255, 255, 0));
  }
  
  .react-colorful__pointer-fill,
  .react-colorful__alpha-gradient {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    border-radius: inherit;
  }
  
  /* Improve elements rendering on light backgrounds */
  .react-colorful__alpha-gradient,
  .react-colorful__saturation {
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
  }
  
  .react-colorful__hue,
  .react-colorful__alpha {
    position: relative;
    height: 24px;
  }
  
  .react-colorful__hue {
    background: linear-gradient(
      to right,
      #f00 0%,
      #ff0 17%,
      #0f0 33%,
      #0ff 50%,
      #00f 67%,
      #f0f 83%,
      #f00 100%
    );
  }
  
  .react-colorful__last-control {
    border-radius: 0 0 8px 8px;
  }
  
  .react-colorful__interactive {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    border-radius: inherit;
    outline: none;
    /* Don't trigger the default scrolling behavior when the event is originating from this element */
    touch-action: none;
  }
  
  .react-colorful__pointer {
    position: absolute;
    z-index: 1;
    box-sizing: border-box;
    width: 28px;
    height: 28px;
    transform: translate(-50%, -50%);
    background-color: #fff;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  .react-colorful__interactive:focus .react-colorful__pointer {
    transform: translate(-50%, -50%) scale(1.1);
  }
  
  /* Chessboard-like pattern for alpha related elements */
  .react-colorful__alpha,
  .react-colorful__alpha-pointer {
    background-color: #fff;
    background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill-opacity=".05"><rect x="8" width="8" height="8"/><rect y="8" width="8" height="8"/></svg>');
  }
  
  /* Display the saturation pointer over the hue one */
  .react-colorful__saturation-pointer {
    z-index: 3;
  }
  
  /* Display the hue pointer over the alpha one */
  .react-colorful__hue-pointer {
    z-index: 2;
  }
  
`

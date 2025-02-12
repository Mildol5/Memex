import React from 'react'
import styled from 'styled-components'
import * as icons from 'src/common-ui/components/design-library/icons'
import {
    AnnotationSearchCopyPaster,
    PageSearchCopyPaster,
} from 'src/copy-paster'
import { SearchType } from '../types'
import { BackgroundSearchParams } from 'src/search/background/types'
import Icon from '@worldbrain/memex-common/lib/common-ui/components/icon'
import { PopoutBox } from '@worldbrain/memex-common/lib/common-ui/components/popout-box'
import { TooltipBox } from '@worldbrain/memex-common/lib/common-ui/components/tooltip-box'

export interface Props {
    searchType?: SearchType
    isCopyPasterShown?: boolean
    isCopyPasterBtnShown?: boolean
    searchParams?: BackgroundSearchParams
    hideCopyPaster?: React.MouseEventHandler
    toggleCopyPaster?: React.MouseEventHandler
}

class SearchCopyPaster extends React.Component<Props> {
    copypasterButtonRef = React.createRef<HTMLDivElement>()

    state = {
        preventClosingBcEditState: false,
    }

    renderCopyPaster() {
        const CopyPaster =
            this.props.searchType === 'notes'
                ? AnnotationSearchCopyPaster
                : PageSearchCopyPaster

        return (
            <CopyPaster
                searchParams={this.props.searchParams}
                onClickOutside={this.props.hideCopyPaster}
                preventClosingBcEditState={(state) =>
                    this.setState({ preventClosingBcEditState: state })
                }
            />
        )
    }

    renderCopyPasterBox() {
        if (this.props.isCopyPasterShown) {
            return (
                <PopoutBox
                    placement={'bottom'}
                    offsetX={10}
                    closeComponent={
                        !this.state.preventClosingBcEditState &&
                        this.props.toggleCopyPaster
                    }
                    targetElementRef={this.copypasterButtonRef.current}
                >
                    {this.renderCopyPaster()}
                </PopoutBox>
            )
        } else {
            return null
        }
    }

    render() {
        return (
            <Container>
                <TooltipBox
                    tooltipText={'Copy Search Results'}
                    placement="bottom"
                >
                    <Icon
                        filePath={icons.copy}
                        heightAndWidth="22px"
                        onClick={this.props.toggleCopyPaster}
                        active={this.props.isCopyPasterShown}
                        padding={'6px'}
                        containerRef={this.copypasterButtonRef}
                    />
                </TooltipBox>
                {this.renderCopyPasterBox()}
            </Container>
        )
    }
}

export default SearchCopyPaster

// TODO: inheirits from .nakedSquareButton

const Container = styled.div``
const ActionBtn = styled.button`
    border-radius: 3px;
    padding: 2px;
    width: 24px;
    height: 24px;
    padding: 3px;
    border-radius: 3px;
    background-repeat: no-repeat;
    background-position: center;
    border: none;
    background-color: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background-color: #e0e0e0;
    }

    &:active {
    }

    &:focus {
        outline: none;
    }

    &:disabled {
        opacity: 0.4;
        background-color: transparent;
    }
`

const ActionIcon = styled.img`
    height: 90%;
    width: auto;
`

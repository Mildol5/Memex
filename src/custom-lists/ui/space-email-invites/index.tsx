import React from 'react'
import styled from 'styled-components'
import { StatefulUIElement } from 'src/util/ui-logic'
import Logic, { Dependencies, State, Event } from './logic'
import { DropdownMenuBtn } from 'src/common-ui/components/dropdown-menu'
import { isValidEmail } from '@worldbrain/memex-common/lib/utils/email-validation'
import TextField from '@worldbrain/memex-common/lib/common-ui/components/text-field'
import { SharedListRoleID } from '@worldbrain/memex-common/lib/content-sharing/types'
import { PrimaryAction } from '@worldbrain/memex-common/lib/common-ui/components/PrimaryAction'
import LoadingIndicator from '@worldbrain/memex-common/lib/common-ui/components/loading-indicator'
import { normalizedStateToArray } from '@worldbrain/memex-common/lib/common-ui/utils/normalized-state'
import { sharedListRoleIDToString } from '@worldbrain/memex-common/lib/content-sharing/ui/list-share-modal/util'
import { __wrapClick } from '../utils'

export interface Props extends Dependencies {
    disableWriteOps?: boolean
}

export default class SpaceEmailInvites extends StatefulUIElement<
    Props,
    State,
    Event
> {
    constructor(props: Props) {
        super(props, new Logic(props))
    }

    async componentDidUpdate(prevProps: Readonly<Props>) {
        if (
            prevProps.listData.unifiedId !== this.props.listData.unifiedId &&
            this.props.listData.remoteId != null
        ) {
            await this.processEvent('reloadEmailInvites', {
                remoteListId: this.props.listData.remoteId!,
            })
            this.processEvent('updateProps', { props: this.props })
        }
    }

    private get shouldShowInviteBtn(): boolean {
        const inputValue = this.state.emailInviteInputValue.trim()
        if (!inputValue.length) {
            return false
        }
        if (!isValidEmail(inputValue)) {
            return false
        }
        let alreadyInvited = false
        for (const invite of normalizedStateToArray(this.state.emailInvites)) {
            if (invite.email === inputValue) {
                alreadyInvited = true
                break
            }
        }
        return !alreadyInvited
    }

    private handleInviteInputChange: React.KeyboardEventHandler = async (
        event,
    ) => {
        const value = (event.target as HTMLInputElement).value
        await this.processEvent('updateEmailInviteInputValue', { value })
    }

    private handleAddInviteInputKeyDown: React.KeyboardEventHandler = async (
        e,
    ) => {
        if (e.key === 'Enter') {
            if (this.state.emailInviteInputValue.trim().length > 0) {
                e.preventDefault()
                e.stopPropagation()
                await this.processEvent('inviteViaEmail', {
                    state: this.state,
                    remoteId: this.props.listData.remoteId,
                })
            }
        }

        // If we don't have this, events will bubble up into the page!
        e.stopPropagation()
    }

    render() {
        return (
            <>
                <SectionTitle>
                    Invite via Email{' '}
                    {this.state.emailInvitesLoadState === 'running' && (
                        <LoadingIndicator size={16} />
                    )}
                </SectionTitle>
                <Container
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                    }}
                >
                    <EditableTextField
                        onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                        }}
                        value={this.state.emailInviteInputValue}
                        onChange={this.handleInviteInputChange}
                        disabled={this.props.disableWriteOps}
                        placeholder="Add email address"
                        icon="mail"
                        onKeyDown={this.handleAddInviteInputKeyDown}
                    />

                    {this.shouldShowInviteBtn && (
                        <>
                            <DropdownMenuBtn
                                elementHeight="40px"
                                backgroundColor={'greyScale1_5'}
                                menuItems={[
                                    {
                                        id: SharedListRoleID.Commenter,
                                        name: sharedListRoleIDToString(
                                            SharedListRoleID.Commenter,
                                        ),
                                    },
                                    {
                                        id: SharedListRoleID.ReadWrite,
                                        name: sharedListRoleIDToString(
                                            SharedListRoleID.ReadWrite,
                                        ),
                                    },
                                ]}
                                onMenuItemClick={(item) =>
                                    this.processEvent(
                                        'updateEmailInviteInputRole',
                                        {
                                            role: item.id as SharedListRoleID,
                                        },
                                    )
                                }
                                initSelectedIndex={
                                    this.state.emailInviteInputRole ===
                                    SharedListRoleID.Commenter
                                        ? 0
                                        : 1
                                }
                                keepSelectedState
                            />
                            <PrimaryAction
                                onClick={() =>
                                    this.processEvent('inviteViaEmail', {
                                        state: this.state,
                                        remoteId: this.props.listData.remoteId,
                                    })
                                }
                                label="Invite"
                                type="secondary"
                                size="medium"
                                fullWidth
                            />
                        </>
                    )}

                    {(this.state.emailInvitesLoadState === 'success' ||
                        this.state.emailInvitesLoadState === 'pristine') &&
                        !this.shouldShowInviteBtn &&
                        normalizedStateToArray(this.state.emailInvites).length >
                            0 && (
                            <EmailListContainer>
                                {normalizedStateToArray(this.state.emailInvites)
                                    .slice()
                                    .reverse()
                                    .map((invite) => (
                                        <InviteItemContainer
                                            onMouseEnter={() => {
                                                this.processEvent(
                                                    'setEmailInvitesHoverState',
                                                    { id: invite.id },
                                                )
                                            }}
                                            onMouseLeave={() => {
                                                this.processEvent(
                                                    'setEmailInvitesHoverState',
                                                    { id: null },
                                                )
                                            }}
                                            key={invite.id}
                                        >
                                            <InvitedBox>
                                                <InvitedEmail>
                                                    {invite.email}
                                                </InvitedEmail>
                                            </InvitedBox>
                                            {this.state
                                                .emailInvitesHoverState ===
                                            invite.id ? (
                                                <PrimaryAction
                                                    onClick={() =>
                                                        this.processEvent(
                                                            'deleteEmailInvite',
                                                            {
                                                                key: invite.sharedListKey.toString(),
                                                            },
                                                        )
                                                    }
                                                    /* sharedListKey will be missing between when the user creates an invite and when the server-side write actually completes. */
                                                    disabled={
                                                        invite.sharedListKey ==
                                                        null
                                                    }
                                                    type="tertiary"
                                                    label="Remove"
                                                    icon={'removeX'}
                                                    fontSize="12px"
                                                    iconSize="16px"
                                                    iconColor="greyScale5"
                                                    padding="0px 5px 0px 0px"
                                                />
                                            ) : (
                                                <InvitedPermission>
                                                    {sharedListRoleIDToString(
                                                        invite.roleID,
                                                    )}
                                                </InvitedPermission>
                                            )}
                                        </InviteItemContainer>
                                    ))}
                            </EmailListContainer>
                        )}
                </Container>
            </>
        )
    }
}

const EmailListContainer = styled.div`
    width: fill-available;
    display: block;
    flex-direction: column;
    align-items: flex-start;
    max-height: 150px;
    overflow-y: scroll;
`

const InviteItemContainer = styled.div`
    height: 40px;
    padding: 0 5px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    grid-gap: 5px;
    width: fill-available;
    width: -moz-available;
    border-bottom: 1px solid ${(props) => props.theme.colors.greyScale2};

    &:last-child {
        border-bottom: none;
    }
`

const InvitedBox = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    grid-gap: 3px;
`

const InvitedEmail = styled.div`
    color: ${(props) => props.theme.colors.greyScale5};
    font-size: 14px;
`

const InvitedPermission = styled.div`
    color: ${(props) => props.theme.colors.greyScale4};
    font-size: 12px;
`

const SectionTitle = styled.div`
    font-size: 14px;
    color: ${(props) => props.theme.colors.greyScale5};
    font-weight: 400;
    width: 100%;
    display: flex;
    justify-content: flex-start;
    grid-gap: 10px;
    align-items: center;
`

const EditableTextField = styled(TextField)`
    padding: 2px 10px;
    border-radius: 5px;
    outline: none;
    flex: 2;
    display: flex;
    min-width: 50px;
    margin-right: 0px;
    font-size: 14px;
    height: 40px;
    outline: none;
    border: none;
    width: fill-available;
`

const Container = styled.div`
    width: fill-available;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    background-color: transparent;
    grid-gap: 2px;
`

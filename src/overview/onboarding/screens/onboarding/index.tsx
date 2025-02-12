import React from 'react'
import styled, { keyframes } from 'styled-components'

import { StatefulUIElement } from 'src/util/ui-logic'
import Logic from './logic'
import type { State, Event, Dependencies } from './types'
import OnboardingBox from '../../components/onboarding-box'
import { OVERVIEW_URL } from 'src/constants'
import Margin from 'src/dashboard-refactor/components/Margin'

import AuthDialog from 'src/authentication/components/AuthDialog/index'

import { runInBackground } from 'src/util/webextensionRPC'
import LoadingIndicator from '@worldbrain/memex-common/lib/common-ui/components/loading-indicator'
import { GUIDED_ONBOARDING_URL } from '../../constants'
import { PrimaryAction } from '@worldbrain/memex-common/lib/common-ui/components/PrimaryAction'
import Icon from '@worldbrain/memex-common/lib/common-ui/components/icon'
import { trackOnboardingPath } from '@worldbrain/memex-common/lib/analytics/events'
import { Checkbox } from 'src/common-ui/components'

const styles = require('../../components/onboarding-box.css')

export interface Props extends Dependencies {}

export default class OnboardingScreen extends StatefulUIElement<
    Props,
    State,
    Event
> {
    static defaultProps: Pick<
        Props,
        | 'navToDashboard'
        | 'authBG'
        | 'personalCloudBG'
        | 'navToGuidedTutorial'
        | 'contentScriptsBG'
        | 'analyticsBG'
    > = {
        authBG: runInBackground(),
        personalCloudBG: runInBackground(),
        contentScriptsBG: runInBackground(),
        navToDashboard: () => {
            window.location.href = OVERVIEW_URL
            window.location.reload()
        },
        navToGuidedTutorial: () => {
            window.open(GUIDED_ONBOARDING_URL)
        },
        analyticsBG: runInBackground(),
    }

    constructor(props: Props) {
        super(props, new Logic(props))
    }

    private renderInfoSide = () => {
        return (
            <RightSide>
                <CommentDemo src={'img/welcomeScreenIllustration.svg'} />
            </RightSide>
        )
    }

    private renderSyncNotif() {
        return (
            <WelcomeContainer>
                <ContentBox>
                    {' '}
                    <LoadingIndicatorBoxSync>
                        <LoadingIndicator size={40} />
                    </LoadingIndicatorBoxSync>
                    <DescriptionText>
                        We're syncing your existing data. <br />
                        It may take a while for everything to show up.
                    </DescriptionText>
                    <PrimaryAction
                        type="secondary"
                        size="medium"
                        label="Go to Dashboard"
                        onClick={() => {
                            this.props.navToDashboard()
                        }}
                    />
                </ContentBox>
            </WelcomeContainer>
        )
    }

    private renderWelcomeStep = () => (
        <WelcomeBox>
            <TitleBox>
                <Title>
                    Welcome to
                    <br /> Memex
                </Title>
                <BetaButton>
                    <BetaButtonInner>BETA</BetaButtonInner>
                </BetaButton>
            </TitleBox>
            <DescriptionText>
                When something breaks or you have feature requests, <br />
                let us know via the live chat at every ? icon.{' '}
            </DescriptionText>
            <PrimaryAction
                label={'Continue'}
                icon={'longArrowRight'}
                onClick={() =>
                    this.processEvent('goToNextOnboardingStep', {
                        step: 'login',
                    })
                }
                type="primary"
                size={'large'}
            />
        </WelcomeBox>
    )
    private renderNudges = () => (
        <WelcomeBox>
            <Title>Enable Nudges</Title>
            <DescriptionText>
                We know its sometimes hard to get into the habit of a new tool.
                <br /> We've built in a few gentle nudges as you browse.
            </DescriptionText>
            <CheckBoxContainer>
                <Checkbox
                    label="Nudges enabled"
                    isChecked={this.state.enableNudges}
                    handleChange={async () => {
                        this.processEvent('enableNudges', null)
                    }}
                    width={'fit-content'}
                />
            </CheckBoxContainer>
            <PrimaryAction
                label={'Continue'}
                icon={'longArrowRight'}
                onClick={() =>
                    this.processEvent('goToNextOnboardingStep', {
                        step: 'nudges',
                    })
                }
                type="primary"
                size={'large'}
            />
        </WelcomeBox>
    )
    private renderBasicIntro = () => (
        <WelcomeBox>
            <Title>
                The one thing you need <br />
                to get started
            </Title>
            <DescriptionText>
                When on a website, hover to the bottom right corner. <br />
                It's the jumping point for saving, organising & summarising.
            </DescriptionText>
            <MemexActionButtonIntro src={'img/memexActionButtonIntro.png'} />
            <PrimaryAction
                label={'Finish'}
                icon={'longArrowRight'}
                onClick={() =>
                    this.processEvent('goToNextOnboardingStep', {
                        step: 'finish',
                    })
                }
                type="primary"
                size={'large'}
            />
        </WelcomeBox>
    )

    private renderLoginStep = () => (
        <WelcomeContainer>
            {this.state.loadState === 'running' ? (
                <ContentBox>
                    <LoadingIndicatorBox>
                        <LoadingIndicator size={40} />
                        <DescriptionText>
                            Preparing a smooth ride
                        </DescriptionText>
                    </LoadingIndicatorBox>
                </ContentBox>
            ) : (
                <ContentBox>
                    <>
                        {this.state.authDialogMode === 'signup' && (
                            <UserScreenContainer>
                                <Title>Sign Up</Title>
                            </UserScreenContainer>
                        )}
                        {this.state.authDialogMode === 'login' && (
                            <UserScreenContainer>
                                <Title>Welcome Back!</Title>
                            </UserScreenContainer>
                        )}
                        {this.state.authDialogMode === 'resetPassword' && (
                            <UserScreenContainer>
                                <Title>Reset your password</Title>
                                <DescriptionText>
                                    We'll send you an email with reset
                                    instructions
                                </DescriptionText>
                            </UserScreenContainer>
                        )}
                        {this.state.authDialogMode ===
                            'ConfirmResetPassword' && (
                            <UserScreenContainer>
                                <Title>Check your Emails</Title>
                                <DescriptionText>
                                    Don't forget the spam folder!
                                </DescriptionText>
                            </UserScreenContainer>
                        )}
                        <AuthDialog
                            onAuth={({ reason }) => {
                                this.processEvent('onUserLogIn', {
                                    newSignUp: reason === 'register',
                                })
                            }}
                            onModeChange={({ mode }) => {
                                this.processEvent('setAuthDialogMode', {
                                    mode,
                                })
                            }}
                        />
                    </>
                </ContentBox>
            )}
            {this.state.loadState === 'error' && (
                <AuthErrorMessage>
                    This account does not exist or the password is wrong.
                </AuthErrorMessage>
            )}
        </WelcomeContainer>
    )

    private renderOnboardingSelection = () => {
        const OnboardingTitles = [
            'Interactive Tutorial',
            'Watch a Video',
            'Read Docs',
            '15min Call',
        ]
        const OnboardingIcons = ['cursor', 'play', 'filePDF', 'peopleFine']

        return (
            <OnboardingOptionsContainer>
                <Title>If you want </Title>
                <DescriptionText>Don't forget the spam folder!</DescriptionText>
                {this.state.showOnboardingVideo ? (
                    <>
                        {' '}
                        {this.renderOnboardingVideo()}
                        <PrimaryAction
                            label="Go Back"
                            onClick={() =>
                                this.processEvent('showOnboardingVideo', null)
                            }
                            size="medium"
                            type="tertiary"
                            icon={'arrowLeft'}
                        />
                    </>
                ) : (
                    <>
                        <OnboardingContainer>
                            <OnboardingOptionBox
                                onClick={async () => {
                                    this.props.navToGuidedTutorial()

                                    if (this.props.analyticsBG) {
                                        try {
                                            await trackOnboardingPath(
                                                this.props.analyticsBG,
                                                {
                                                    type: 'interactive',
                                                },
                                            )
                                        } catch (error) {
                                            console.error(
                                                `Error tracking onboarding tutorial', ${error}`,
                                            )
                                        }
                                    }
                                }}
                            >
                                <RecommendedPill>Recommended</RecommendedPill>
                                <OnboardingTitle>
                                    Interactive Tutorial
                                </OnboardingTitle>
                                <Icon
                                    icon={OnboardingIcons[0]}
                                    heightAndWidth="40px"
                                    color="prime1"
                                    hoverOff
                                />
                            </OnboardingOptionBox>
                            <OnboardingOptionBox
                                onClick={async () => {
                                    this.processEvent(
                                        'showOnboardingVideo',
                                        null,
                                    )
                                    if (this.props.analyticsBG) {
                                        try {
                                            await trackOnboardingPath(
                                                this.props.analyticsBG,
                                                {
                                                    type: 'video',
                                                },
                                            )
                                        } catch (error) {
                                            console.error(
                                                `Error tracking onboarding tutorial', ${error}`,
                                            )
                                        }
                                    }
                                }}
                            >
                                <OnboardingTitle>Watch a Video</OnboardingTitle>
                                <Icon
                                    icon={OnboardingIcons[1]}
                                    heightAndWidth="40px"
                                    color="prime1"
                                    hoverOff
                                />
                            </OnboardingOptionBox>
                            <OnboardingOptionBox
                                onClick={async () => {
                                    window.open(
                                        'https://calendly.com/worldbrain/memex-onboarding-call',
                                        '_blank',
                                    )
                                    if (this.props.analyticsBG) {
                                        try {
                                            await trackOnboardingPath(
                                                this.props.analyticsBG,
                                                {
                                                    type: 'onboardingCall',
                                                },
                                            )
                                        } catch (error) {
                                            console.error(
                                                `Error tracking onboarding tutorial', ${error}`,
                                            )
                                        }
                                    }
                                }}
                            >
                                <OnboardingTitle>15min Call</OnboardingTitle>
                                <Icon
                                    icon={OnboardingIcons[3]}
                                    heightAndWidth="40px"
                                    color="prime1"
                                    hoverOff
                                />
                            </OnboardingOptionBox>
                        </OnboardingContainer>
                        <PrimaryAction
                            type="tertiary"
                            label="I'll just start by playing around"
                            onClick={async () => {
                                this.props.navToDashboard()
                                if (this.props.analyticsBG) {
                                    try {
                                        await trackOnboardingPath(
                                            this.props.analyticsBG,
                                            {
                                                type: 'skip',
                                            },
                                        )
                                    } catch (error) {
                                        console.error(
                                            `Error tracking onboarding tutorial', ${error}`,
                                        )
                                    }
                                }
                            }}
                            size="large"
                            icon={'arrowRight'}
                            iconPosition="right"
                        />
                    </>
                )}
            </OnboardingOptionsContainer>
        )
    }

    private renderOnboardingVideo = () => {
        return (
            <OnboardingContainer>
                <OnboardingVideo
                    src="https://share.descript.com/embed/QTnFzKBo7XM"
                    frameBorder="0"
                    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            </OnboardingContainer>
        )
    }

    render() {
        return (
            <OnboardingBox>
                <OnboardingContent>
                    {this.state.welcomeStep === 'start' &&
                        this.renderWelcomeStep()}
                    {this.state.welcomeStep === 'nudges' && this.renderNudges()}
                    {this.state.welcomeStep === 'basicIntro' &&
                        this.renderBasicIntro()}
                    {this.state.showSyncNotification &&
                        this.state.welcomeStep === 'finish' &&
                        this.renderSyncNotif()}
                    {this.state.showOnboardingSelection &&
                        this.renderBasicIntro()}
                    {!this.state.showOnboardingSelection &&
                        !this.state.showSyncNotification &&
                        this.state.welcomeStep === 'login' &&
                        this.renderLoginStep()}
                </OnboardingContent>
                {this.renderInfoSide()}
            </OnboardingBox>
        )
    }
}

const OnboardingContent = styled.div`
    z-index: 1;
    position: relative;
`

const MemexActionButtonIntro = styled.img`
    height: 450px;
    width: auto;
    border-radius: 8px;
    margin-top: -250px;
    z-index: -1;
    margin-bottom: 30px;
`

const CheckBoxContainer = styled.div`
    margin-bottom: 40px;
    margin-top: -10px;
`

const TitleBox = styled.div`
    margin-bottom: 40px;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
`

const WelcomeBox = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
`

const BetaButton = styled.div`
    display: flex;
    background: linear-gradient(
        90deg,
        #d9d9d9 0%,
        #2e73f8 0.01%,
        #0a4bca 78.86%,
        #0041be 100%
    );
    border-radius: 50px;
    height: 48px;
    width: 88px;
    align-items: center;
    justify-content: center;
`

const BetaButtonInner = styled.div`
    display: flex;
    background: ${(props) => props.theme.colors.black};
    color: #0a4bca;
    font-size: 20px;
    letter-spacing: 1px;
    height: 40px;
    width: 80px;
    font-weight: 600;
    align-items: center;
    justify-content: center;
    border-radius: 50px;
`

const RecommendedPill = styled.div`
    background-color: ${(props) => props.theme.colors.prime2};
    color: ${(props) => props.theme.colors.black};
    border-radius: 20px;
    padding: 4px 8px;
    font-size: 10px;
    position: absolute;
    bottom: 15px;
`

const OnboardingVideo = styled.iframe`
    width: 800px;
    height: 450px;
    border: 1px solid ${(props) => props.theme.colors.greyScale1};
    border-radius: 20px;
`

const OnboardingOptionsContainer = styled.div`
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    grid-gap: 20px;
    flex-direction: column;
`

const OnboardingOptionBox = styled.div`
    border: 1px solid ${(props) => props.theme.colors.greyScale2};
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    height: 200px;
    width: 200px;
    justify-content: center;
    align-items: center;
    grid-gap: 15px;
    position: relative;

    &:hover {
        background-color: ${(props) => props.theme.colors.greyScale1};
        border: 1px solid ${(props) => props.theme.colors.greyScale2};
        cursor: pointer;
        & * {
            cursor: pointer;
        }
    }
`

const OnboardingContainer = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    width: fit-content;
    gap: 10px;
`
const OnboardingTitle = styled.div`
    background: linear-gradient(225deg, #6ae394 0%, #fff 100%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    font-size: 18px;
    text-align: center;
`

const AuthErrorMessage = styled.div`
    background-color: ${(props) => props.theme.colors.warning}10;
    font-size: 14px;
    padding-left: 10px;
    margin-top: 5px;
    color: ${(props) => props.theme.colors.warning};
    border: 1px solid ${(props) => props.theme.colors.warning};
    padding: 15px;
    border-radius: 5px;
    display: flex;
    justify-content: center;
    align-items: center;
    max-width: 350px;
`

const LoadingIndicatorBox = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    grid-gap: 40px;
    height: 300px;
    width: 400px;
`
const LoadingIndicatorBoxSync = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;

    height: 100px;
    width: 40px;
`

const UserScreenContainer = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
`

const WelcomeContainer = styled.div`
    display: flex;
    justify-content: space-between;
    overflow: hidden;
    background-color: ${(props) => props.theme.colors.black};
    height: 100vh;
`

const openAnimation = keyframes`
 0% { opacity: 0; margin-top: 100px;}
 100% { opacity: 1; margin-top: 0px;}
`

const AnnotationBox = styled.div<{
    isActive: boolean
    zIndex: number
    order: number
}>`
    width: 99%;
    z-index: ${(props) => props.zIndex};

    animation-name: ${openAnimation};
    animation-duration: 600ms;
    animation-delay: ${(props) => props.order * 40}ms;
    animation-timing-function: cubic-bezier(0.16, 0.67, 0.47, 0.97);
    animation-fill-mode: backwards;
    position: relative;
`

const LeftSide = styled.div`
    width: fill-available;
    display: flex;
    align-items: center;
    z-index: 2;
    flex-direction: row;
    z-index: 2;
    /* position: absolute; */
    justify-content: flex-start;
    margin-left: 20%;
    animation-name: ${openAnimation};
    animation-duration: 600ms;
    animation-delay: ${(props) => props.order * 40}ms;
    animation-timing-function: cubic-bezier(0.16, 0.67, 0.47, 0.97);
    animation-fill-mode: backwards;
    position: relative;

    @media (max-width: 1000px) {
        width: 100%;
    }
`

const LogoImg = styled.img`
    height: 50px;
    width: auto;
`

const ContentBox = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 30px 50px;
    background: ${(props) => props.theme.colors.black}30;
    backdrop-filter: blur(5px);
    border-radius: 20px;
    z-index: 2;
`

const Title = styled.div`
    background: ${(props) => props.theme.colors.headerGradient};
    font-size: 60px;
    font-weight: 800;
    margin-bottom: 20px;
    margin-top: 30px;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-align: center;
`

const DescriptionText = styled.div`
    color: ${(props) => props.theme.colors.greyScale5};
    font-size: 18px;
    font-weight: 300;
    margin-bottom: 40px;
    text-align: center;
`

const RightSide = styled.div`
    width: min-content;
    height: 100vh;
    background-size: cover;
    background-repeat: no-repeat;
    grid-auto-flow: row;
    justify-content: center;
    align-items: center;
    position: absolute;
    right: 0;
    top: 0%;
    z-index: 0;

    @media (max-width: 1000px) {
        display: none;
    }
`

const CommentDemo = styled.img`
    height: fill-available;
    width: auto;
    margin: auto;
    opacity: 0.4;
`

const TitleSmall = styled.div`
    color: ${(props) => props.theme.colors.darkerText};
    font-size: 22px;
    font-weight: 800;
    text-align: center;
`

const StyledAuthDialog = styled.div`
    font-family: 'Satoshi', sans-serif;
    font-feature-settings: 'pnum' on, 'lnum' on, 'case' on, 'ss03' on, 'ss04' on,
        'liga' off;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
`
const Header = styled.div`
    text-align: center;
    font-size: 16px;
    font-weight: bold;
`
const AuthenticationMethods = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: center;
    width: 100%;
`
const EmailPasswordLogin = styled.div`
    display: grid;
    grid-auto-flow: row;
    grid-gap: 15px;
    justify-content: center;
    align-items: center;
`
const EmailPasswordError = styled.div`
    color: red;
    font-weight: bold;
    text-align: center;
`

const FormTitle = styled.div`
    font-weight: bold;
    font-size: 24px;
    color: ${(props) => props.theme.colors.primary};
    text-align: center;
`
const FormSubtitle = styled.div`
    font-weight: 500;
    font-size: 16px;
    text-align: center;
    color: ${(props) => props.theme.colors.secondary};
`

const AuthBox = styled(Margin)`
    display: flex;
    justify-content: center;
    width: 100%;
`

const Footer = styled.div`
    text-align: center;
    user-select: none;
    color: ${(props) => props.theme.colors.darkerText};
    font-size: 14px;
    opacity: 0.8;
`
const ModeSwitch = styled.span`
    cursor: pointer;
    font-weight: bold;
    color: ${(props) => props.theme.colors.prime1};
    font-weight: 14px;
`

const GoToDashboard = styled.span`
    cursor: pointer;
    font-weight: bold;
    color: ${(props) => props.theme.colors.prime1};
    font-size: 15px;
`

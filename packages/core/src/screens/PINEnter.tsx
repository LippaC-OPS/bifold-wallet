import { useNavigation } from '@react-navigation/native'
import React, { useCallback, useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, StyleSheet, View, DeviceEventEmitter, InteractionManager, Pressable } from 'react-native'

import Button, { ButtonType } from '../components/buttons/Button'
import PINInput from '../components/inputs/PINInput'
import { InfoBoxType } from '../components/misc/InfoBox'
import PopupModal from '../components/modals/PopupModal'
import KeyboardView from '../components/views/KeyboardView'
import { minPINLength, EventTypes, defaultAutoLockTime, attemptLockoutConfig } from '../constants'
import { TOKENS, useServices } from '../container-api'
import { useAnimatedComponents } from '../contexts/animated-components'
import { useAuth } from '../contexts/auth'
import { DispatchAction } from '../contexts/reducers/store'
import { useStore } from '../contexts/store'
import { useTheme } from '../contexts/theme'
import { BifoldError } from '../types/error'
import { testIdWithKey } from '../utils/testable'
import { InlineErrorType, InlineMessageProps } from '../components/inputs/InlineErrorText'
import { ThemedText } from '../components/texts/ThemedText'
import { useDeveloperMode } from '../hooks/developer-mode'
import { useLockout } from '../hooks/lockout'

interface PINEnterProps {
  setAuthenticated: (status: boolean) => void
}

const PINEnter: React.FC<PINEnterProps> = ({ setAuthenticated }) => {
  const { t } = useTranslation()
  const { checkWalletPIN, getWalletSecret, isBiometricsActive, disableBiometrics } = useAuth()
  const [store, dispatch] = useStore()
  const [PIN, setPIN] = useState<string>('')
  const [continueEnabled, setContinueEnabled] = useState(true)
  const [displayLockoutWarning, setDisplayLockoutWarning] = useState(false)
  const [biometricsErr, setBiometricsErr] = useState(false)
  const navigation = useNavigation()
  const [alertModalVisible, setAlertModalVisible] = useState<boolean>(false)
  const [biometricsEnrollmentChange, setBiometricsEnrollmentChange] = useState<boolean>(false)
  const { ColorPallet } = useTheme()
  const { ButtonLoading } = useAnimatedComponents()
  const [
    logger,
    { enableHiddenDevModeTrigger, attemptLockoutConfig: { thresholdRules } = attemptLockoutConfig },
  ] = useServices([TOKENS.UTIL_LOGGER, TOKENS.CONFIG])
  const [inlineMessageField, setInlineMessageField] = useState<InlineMessageProps>()
  const [inlineMessages] = useServices([TOKENS.INLINE_ERRORS])
  const [alertModalMessage, setAlertModalMessage] = useState('')
  const { getLockoutPenalty, attemptLockout, unMarkServedPenalty } = useLockout()

  const { incrementDeveloperMenuCounter } = useDeveloperMode()

  const gotoPostAuthScreens = useCallback(() => {
    if (store.onboarding.postAuthScreens.length) {
      const screen = store.onboarding.postAuthScreens[0]
      if (screen) {
        navigation.navigate(screen as never)
      }
    }
  }, [store.onboarding.postAuthScreens, navigation])

  const isContinueDisabled = (inlineMessages.enabled) ? !continueEnabled : (!continueEnabled || PIN.length < minPINLength)

  // listen for biometrics error event
  useEffect(() => {
    const handle = DeviceEventEmitter.addListener(EventTypes.BIOMETRY_ERROR, (value?: boolean) => {
      setBiometricsErr((prev) => value ?? !prev)
    })

    return () => {
      handle.remove()
    }
  }, [])

  const loadWalletCredentials = useCallback(async () => {
    const walletSecret = await getWalletSecret()
    if (walletSecret) {
      // remove lockout notification
      dispatch({
        type: DispatchAction.LOCKOUT_UPDATED,
        payload: [{ displayNotification: false }],
      })

      // reset login attempts if login is successful
      dispatch({
        type: DispatchAction.ATTEMPT_UPDATED,
        payload: [{ loginAttempts: 0 }],
      })

      setAuthenticated(true)
      gotoPostAuthScreens()
    }
  },[getWalletSecret, dispatch, setAuthenticated, gotoPostAuthScreens])

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(async () => {
      if (!store.preferences.useBiometry) {
        return
      }

      try {
        const active = await isBiometricsActive()
        if (!active) {
          // biometry state has changed, display message and disable biometry
          setBiometricsEnrollmentChange(true)
          await disableBiometrics()
          dispatch({
            type: DispatchAction.USE_BIOMETRY,
            payload: [false],
          })
        }
        await loadWalletCredentials()
      } catch (error) {
        logger.error(`error checking biometrics / loading credentials: ${JSON.stringify(error)}`)
      }
    })

    return handle.cancel
  }, [store.preferences.useBiometry, isBiometricsActive, disableBiometrics, dispatch, loadWalletCredentials, logger])

  useEffect(() => {
    // check number of login attempts and determine if app should apply lockout
    const attempts = store.loginAttempt.loginAttempts
    // display warning if we are one away from a lockout
    const displayWarning = !!getLockoutPenalty(attempts + 1)
    setDisplayLockoutWarning(displayWarning)
  }, [store.loginAttempt.loginAttempts, getLockoutPenalty])

  useEffect(() => {
    setInlineMessageField(undefined)
  }, [PIN])

  const unlockWalletWithPIN = useCallback(
    async (PIN: string) => {
      try {
        setContinueEnabled(false)
        const result = await checkWalletPIN(PIN)

        if (store.loginAttempt.servedPenalty) {
          // once the user starts entering their PIN, unMark them as having served their
          // lockout penalty
          unMarkServedPenalty()
        }

        if (!result) {
          const newAttempt = store.loginAttempt.loginAttempts + 1
          let message = '';
          const attemptsLeft =
            (thresholdRules.increment - (newAttempt % thresholdRules.increment)) % thresholdRules.increment

          if (!inlineMessages.enabled && !getLockoutPenalty(newAttempt)) {
            // skip displaying modals if we are going to lockout
            setAlertModalVisible(true)
          }
          if (attemptsLeft > 1) {
              message = t('PINEnter.IncorrectPINTries', { tries: attemptsLeft })
          }
          if(attemptsLeft === 1) {
              message = t('PINEnter.LastTryBeforeTimeout')
          }
          else {
            const penalty = getLockoutPenalty(newAttempt)
            if (penalty !== undefined) {
              attemptLockout(penalty) // Only call attemptLockout if penalty is defined
            }
            return
          }
          if (inlineMessages.enabled) {
            setInlineMessageField({
              message,
              inlineType: InlineErrorType.error,
              config: inlineMessages,
            })
          } else {
            setAlertModalMessage(message)
          }
          setContinueEnabled(true)

          // log incorrect login attempts
          dispatch({
            type: DispatchAction.ATTEMPT_UPDATED,
            payload: [{ loginAttempts: newAttempt }],
          })
          return
        }

        // reset login attempts if login is successful
        dispatch({
          type: DispatchAction.ATTEMPT_UPDATED,
          payload: [{ loginAttempts: 0 }],
        })

        // remove lockout notification if login is successful
        dispatch({
          type: DispatchAction.LOCKOUT_UPDATED,
          payload: [{ displayNotification: false }],
        })

        setAuthenticated(true)
        gotoPostAuthScreens()
      } catch (err: unknown) {
        const error = new BifoldError(
          t('Error.Title1041'),
          t('Error.Message1041'),
          (err as Error)?.message ?? err,
          1041
        )
        DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
      }
    },
    [
      checkWalletPIN,
      store.loginAttempt,
      unMarkServedPenalty,
      getLockoutPenalty,
      dispatch,
      setAuthenticated,
      gotoPostAuthScreens,
      t,
      attemptLockout,
      inlineMessages,
      thresholdRules.increment,
    ]
  )

  const clearAlertModal = useCallback(() => {
    setAlertModalVisible(false)
  }, [setAlertModalVisible])

  // both of the async functions called in this function are completely wrapped in try catch
  const onPINInputCompleted = useCallback(
    async (PIN: string) => {
      if (inlineMessages.enabled && PIN.length < minPINLength) {
        setInlineMessageField({
          message: t('PINCreate.PINTooShort'),
          inlineType: InlineErrorType.error,
          config: inlineMessages,
        })

        return
      }
      setContinueEnabled(false)
      await unlockWalletWithPIN(PIN)
    },
    [unlockWalletWithPIN, t, inlineMessages]
  )

  const showHelpText = (store.lockout.displayNotification || biometricsEnrollmentChange || biometricsErr)

  const HelpText = useMemo(() => {
    if (store.lockout.displayNotification) {
      return (
        <>
          <ThemedText style={style.helpText}>
            {t('PINEnter.LockedOut', { time: String(store.preferences.autoLockTime ?? defaultAutoLockTime) })}
          </ThemedText>
          <ThemedText style={style.helpText}>{t('PINEnter.ReEnterPIN')}</ThemedText>
        </>
      )
    }
    if (biometricsEnrollmentChange) {
      return (
        <>
          <ThemedText style={style.helpText}>{t('PINEnter.BiometricsChanged')}</ThemedText>
          <ThemedText style={style.helpText}>{t('PINEnter.BiometricsChangedEnterPIN')}</ThemedText>
        </>
      )
    }
    if (biometricsErr) {
      return (
        <>
          <ThemedText style={style.helpText}>{t('PINEnter.BiometricsError')}</ThemedText>
          <ThemedText style={style.helpText}>{t('PINEnter.BiometricsErrorEnterPIN')}</ThemedText>
        </>
      )
    }
    return (
      <>
        <ThemedText variant="headingTwo" style={style.title}>
          {t('PINEnter.Title')}
        </ThemedText>
        <ThemedText variant="labelSubtitle" style={style.subTitle}>
          {t('PINEnter.SubText')}
        </ThemedText>
      </>
    )
  }, [
    store.lockout.displayNotification,
    style.helpText,
    t,
    biometricsEnrollmentChange,
    biometricsErr,
    style.title,
    style.subTitle,
    store.preferences.autoLockTime,
  ])

  return (
    <KeyboardView>
      <View style={[style.screenContainer, { backgroundColor: ColorPallet.brand.primaryBackground }]}>
        <View style={style.contentContainer}>
          <Pressable onPress={enableHiddenDevModeTrigger ? incrementDeveloperMenuCounter : () => {}} testID={testIdWithKey('DeveloperCounter')}>
            {HelpText}
          </Pressable>
          <ThemedText variant="bold" style={style.inputLabel}>
            { t('PINEnter.EnterPIN')}
          </ThemedText>
          <PINInput
            onPINChanged={(p: string) => {
              setPIN(p)
              if (p.length === minPINLength) {
                Keyboard.dismiss()
              }
            }}
            testID={testIdWithKey('EnterPIN')}
            accessibilityLabel={ t('PINEnter.EnterPIN')}
            autoFocus={true}
            inlineMessage={inlineMessageField}
          />
        </View>
        <View style={style.controlsContainer}>
          <View style={style.buttonContainer}>
            <Button
              title={t('PINEnter.Unlock')}
              buttonType={ButtonType.Primary}
              testID={testIdWithKey('Enter')}
              disabled={isContinueDisabled}
              accessibilityLabel={t('PINEnter.Unlock')}
              onPress={() => {
                Keyboard.dismiss()
                onPINInputCompleted(PIN)
              }}
            >
              {!continueEnabled && <ButtonLoading />}
            </Button>
          </View>
          {store.preferences.useBiometry && (
            <>
              <ThemedText style={{ alignSelf: 'center', marginTop: 10 }}>{t('PINEnter.Or')}</ThemedText>
              <View style={[style.buttonContainer, { marginTop: 10 }]}>
                <Button
                  title={t('PINEnter.BiometricsUnlock')}
                  buttonType={ButtonType.Secondary}
                  testID={testIdWithKey('BiometricsUnlock')}
                  disabled={!continueEnabled}
                  accessibilityLabel={t('PINEnter.BiometricsUnlock')}
                  onPress={loadWalletCredentials}
                />
              </View>
            </>
          )}
        </View>
      </View>
      {alertModalVisible && (
        <PopupModal
          notificationType={InfoBoxType.Info}
          title={t('PINEnter.IncorrectPIN')}
          bodyContent={
            <View>
              <ThemedText variant="popupModalText" style={style.modalText}>
                {alertModalMessage}
              </ThemedText>
              {displayLockoutWarning ? (
                <ThemedText variant="popupModalText" style={style.modalText}>
                  {t('PINEnter.AttemptLockoutWarning')}
                </ThemedText>
              ) : null}
            </View>
          }
          onCallToActionLabel={t('Global.Okay')}
          onCallToActionPressed={clearAlertModal}
        />
      )}
    </KeyboardView>
  )
}

const style = StyleSheet.create({
  screenContainer: {
    height: '100%',

    padding: 20,
    justifyContent: 'space-between',
  },
  // below used as helpful labels for views, no properties needed atp
  contentContainer: {},
  controlsContainer: {},
  buttonContainer: {
    width: '100%',
  },
  helpText: {
    alignSelf: 'auto',
    textAlign: 'left',
    marginBottom: 16,
  },
  inputLabel: {
    marginBottom: 16,
  },
  title: {

  },
  subtext: {

  },
  modalText: {
    marginVertical: 5,
  },
  subTitle: {
    marginBottom: 20,
  },
})

export default PINEnter


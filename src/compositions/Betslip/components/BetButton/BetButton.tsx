'use client'

import React, { useRef } from 'react'
import cx from 'classnames'
import { useBaseBetslip, useChain, useDetailedBetslip, useBet } from '@azuro-org/sdk'
import { type Address } from 'viem'
import { Message } from '@locmod/intl'
import { useAccount } from '@azuro-org/sdk-social-aa-connector'
import { openModal } from '@locmod/modal'
import localStorage from '@locmod/local-storage'
import { useQueryClient } from '@tanstack/react-query'
import { constants, isUserRejectedRequestError, toLocaleString } from 'helpers'

import { Icon } from 'components/ui'
import { buttonMessages } from 'components/inputs'

import messages from './messages'


type BetButtonProps = {
  isEnoughBalance: boolean
  isBalanceFetching: boolean
}

const BetButton: React.FC<BetButtonProps> = ({ isEnoughBalance, isBalanceFetching }) => {
  const { address } = useAccount()
  const { betToken } = useChain()
  const { items, clear } = useBaseBetslip()
  const queryClient = useQueryClient()
  const {
    betAmount, odds, totalOdds, selectedFreebet,
    isBetAllowed, isOddsFetching, isStatesFetching, isMaxBetFetching,
  } = useDetailedBetslip()
  const totalOddsRef = useRef(totalOdds)

  if (!isOddsFetching) {
    totalOddsRef.current = totalOdds
  }

  const slippage = +(localStorage.getItem(constants.localStorageKeys.slippage) as string || constants.defaultSlippage)
  const diff = selectedFreebet && selectedFreebet.params.isSponsoredBetReturnable ? +selectedFreebet.amount : 0
  const possibleWin = toLocaleString(totalOddsRef.current * +betAmount - diff, { digits: 2 })

  const {
    submit,
    approveTx,
    betTx,
    isRelayerFeeLoading,
    isAllowanceLoading,
    isApproveRequired,
  } = useBet({
    // betAmount: isBatch ? batchBetAmounts : betAmount,
    betAmount,
    slippage,
    affiliate: process.env.NEXT_PUBLIC_AFFILIATE_ADDRESS as Address,
    selections: items,
    odds,
    totalOdds,
    freebet: selectedFreebet,
    onSuccess: () => {
      // WORKAROUND: Subgraph 索引有延迟（通常 3~15 秒），下注成功时数据可能尚未入库。
      // 通过延迟多次 invalidate 来确保最终能拿到最新下注记录。
      const invalidateBets = () => {
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) =>
            queryKey[0] === 'bets' || queryKey[0] === 'bets-summary',
        })
      }

      // 立即尝试一次
      invalidateBets()
      // 延迟 3s / 6s / 10s 再各尝试一次，等 Subgraph 索引完成
      setTimeout(invalidateBets, 3000)
      setTimeout(invalidateBets, 6000)
      setTimeout(invalidateBets, 10000)

      openModal('SuccessModal', {
        title: messages.success.title,
      })
      clear()
    },
    onError: (err) => {
      if (!isUserRejectedRequestError(err)) {
        openModal('ErrorModal')
      }

      console.log('Bet err:', err)
    },
  })

  const isPending = approveTx.isPending || betTx.isPending
  const isProcessing = approveTx.isProcessing || betTx.isProcessing

  const isLoading = (
    isOddsFetching
    || isMaxBetFetching
    || isBalanceFetching
    || isStatesFetching
    || isAllowanceLoading
    || isPending
    || isProcessing
    || isRelayerFeeLoading
  )

  const isDisabled = (
    isLoading
    || !address
    || !isBetAllowed
    || (!isEnoughBalance && !isApproveRequired)
    || (!+betAmount && !selectedFreebet)
  )

  const rootClassName = cx('flex items-center justify-between py-1 pr-1 border rounded-md w-full', {
    'bg-bg-l1 border-grey-10 cursor-not-allowed': isDisabled,
    'bg-brand-50 text-grey-90 border-white/20': !isDisabled,
  })
  const possibleWinClassName = cx('text-caption-12 flex items-center p-2 rounded-sm flex-none select-none', {
    'bg-grey-15 text-grey-20': isDisabled,
    'bg-white/20 text-grey-90': !isDisabled,
  })

  return (
    <button className={rootClassName} onClick={submit} disabled={isDisabled}>
      <div className="w-full text-center px-1">
        {
          isLoading ? (
            <Icon className="size-4 mx-auto" name="interface/spinner" />
          ) : (
            <Message
              className="font-bold text-caption-14"
              value={isApproveRequired ? buttonMessages.approve : buttonMessages.placeBet}
            />
          )
        }
      </div>
      <div className={possibleWinClassName}>
        <Message className="mr-1" value={messages.possibleWin} />
        <div className="font-semibold">{possibleWin} {betToken.symbol}</div>
      </div>
    </button>
  )
}

export default BetButton

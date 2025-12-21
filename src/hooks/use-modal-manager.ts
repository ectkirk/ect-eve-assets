import { useState, useCallback, useMemo } from 'react'

type ModalState<T extends string> = {
  openModal: T | null
  isOpen: (modal: T) => boolean
  open: (modal: T) => void
  close: () => void
  setOpen: (modal: T, open: boolean) => void
}

export function useModalManager<T extends string>(): ModalState<T> {
  const [openModal, setOpenModal] = useState<T | null>(null)

  const isOpen = useCallback((modal: T) => openModal === modal, [openModal])
  const open = useCallback((modal: T) => setOpenModal(modal), [])
  const close = useCallback(() => setOpenModal(null), [])
  const setOpen = useCallback(
    (modal: T, shouldOpen: boolean) => setOpenModal(shouldOpen ? modal : null),
    []
  )

  return useMemo(
    () => ({ openModal, isOpen, open, close, setOpen }),
    [openModal, isOpen, open, close, setOpen]
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Clock,
  Database,
  FileText,
  FlaskConical,
  GitBranch,
  Layers,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  TestTube2,
  Thermometer,
  Wind,
} from 'lucide-react'
import { armsApi, experimentsApi, observationsApi, studiesApi } from '../../services/api'
import type { Experiment, Observation, Study, TreatmentArm } from '../../types'

const STATUS_STYLES: Record<string, string> = {
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-rose-200 bg-rose-50 text-rose-700',
  extracted: 'border-slate-200 bg-slate-50 text-slate-600',
  needs_review: 'border-amber-200 bg-amber-50 text-amber-700',
  in_review: 'border-blue-200 bg-blue-50 text-blue-700',
  changes_requested: 'border-orange-200 bg-orange-50 text-orange-700',
}

const PAGE_SIZE = 1000

async function fetchAllObservations(projectId: number): Promise<Observation[]> {
  const all: Observation[] = []
  let skip = 0

  while (true) {
    const batch = await observationsApi.list({ project_id: projectId, skip, limit: PAGE_SIZE })
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    skip += PAGE_SIZE
  }

  return all
}

function prettyStatus(value: string) {
  return value.replace(/_/g, ' ')
}

function compactDoi(value?: string) {
  if (!value) return null
  return value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
}

function treatmentName(arm: TreatmentArm) {
  if (arm.arm_label?.trim()) return arm.arm_label.trim()
  if (arm.ingredient_name_normalized?.trim()) return arm.ingredient_name_normalized.trim()
  if (arm.ingredient_name_original?.trim()) return arm.ingredient_name_original.trim()
  return arm.is_control ? 'Control' : `Treatment ${arm.id}`
}

function productName(exp: Experiment) {
  return exp.product_name_normalized || exp.product_name_original || exp.matrix_description || 'Experimental condition'
}

export default function ResearchStructurePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [studies, setStudies] = useState<Study[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [arms, setArms] = useState<TreatmentArm[]>([])
  const [observations, setObservations] = useState<Observation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [expandedStudies, setExpandedStudies] = useState<Set<number>>(new Set())
  const [expandedExperiments, setExpandedExperiments] = useState<Set<number>>(new Set())

  const load = useCallback(async (quiet = false) => {
    if (!projectId) return
    const pid = Number(projectId)
    if (!quiet) setLoading(true)
    setRefreshing(quiet)
    setError(null)

    try {
      const [studyRows, experimentRows, observationRows] = await Promise.all([
        studiesApi.list(pid, { limit: 500 }),
        experimentsApi.list({ project_id: pid, limit: 500 }),
        fetchAllObservations(pid),
      ])

      const armGroups = await Promise.all(
        experimentRows.map((experiment) => armsApi.list({ experiment_id: experiment.id, limit: 1000 })),
      )
      const armRows = armGroups.flat()

      setStudies(studyRows)
      setExperiments(experimentRows)
      setArms(armRows)
      setObservations(observationRows)

      setExpandedStudies((current) => {
        if (current.size > 0) return current
        return new Set(studyRows.map((study) => study.id))
      })
      setExpandedExperiments((current) => {
        if (current.size > 0) return current
        return new Set(experimentRows.slice(0, 4).map((experiment) => experiment.id))
      })
    } catch (e: unknown) {
      // FastAPI validation errors (422) return `detail` as an array of
      // {msg, loc, ...} objects rather than a string — rendering that array
      // directly as JSX crashes the page, so only ever surface a string.
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      const message = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d))).join('; ')
          : null
      setError(message || 'Could not load the research structure for this project.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const observationCountByArm = useMemo(() => {
    const counts = new Map<number, number>()
    observations.forEach((observation) => {
      counts.set(observation.treatment_arm_id, (counts.get(observation.treatment_arm_id) || 0) + 1)
    })
    return counts
  }, [observations])

  const armsByExperiment = useMemo(() => {
    const grouped = new Map<number, TreatmentArm[]>()
    arms.forEach((arm) => {
      const list = grouped.get(arm.experiment_id) || []
      list.push(arm)
      grouped.set(arm.experiment_id, list)
    })
    return grouped
  }, [arms])

  const experimentsByStudy = useMemo(() => {
    const grouped = new Map<number, Experiment[]>()
    experiments.forEach((experiment) => {
      const list = grouped.get(experiment.study_id) || []
      list.push(experiment)
      grouped.set(experiment.study_id, list)
    })
    return grouped
  }, [experiments])

  const observationTypesByExperiment = useMemo(() => {
    const armToExperiment = new Map<number, number>()
    arms.forEach((arm) => armToExperiment.set(arm.id, arm.experiment_id))
    const grouped = new Map<number, Set<string>>()
    observations.forEach((observation) => {
      const experimentId = armToExperiment.get(observation.treatment_arm_id)
      if (!experimentId) return
      const values = grouped.get(experimentId) || new Set<string>()
      if (observation.measurement_subtype) values.add(observation.measurement_subtype)
      else if (observation.measurement_type) values.add(observation.measurement_type)
      grouped.set(experimentId, values)
    })
    return grouped
  }, [arms, observations])

  const studyStats = useMemo(() => {
    const stats = new Map<number, { experiments: number; treatments: number; observations: number }>()
    studies.forEach((study) => {
      const studyExperiments = experimentsByStudy.get(study.id) || []
      let treatments = 0
      let observationCount = 0
      studyExperiments.forEach((experiment) => {
        const experimentArms = armsByExperiment.get(experiment.id) || []
        treatments += experimentArms.length
        experimentArms.forEach((arm) => {
          observationCount += observationCountByArm.get(arm.id) || 0
        })
      })
      stats.set(study.id, { experiments: studyExperiments.length, treatments, observations: observationCount })
    })
    return stats
  }, [studies, experimentsByStudy, armsByExperiment, observationCountByArm])

  const visibleStudies = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return studies

    return studies.filter((study) => {
      const direct = [study.title, study.journal, study.study_type, ...(study.authors || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
      if (direct) return true

      return (experimentsByStudy.get(study.id) || []).some((experiment) => {
        const expMatch = [
          experiment.experiment_label,
          experiment.product_name_original,
          experiment.product_name_normalized,
          experiment.food_category,
          experiment.packaging_type,
          experiment.atmosphere_type,
        ].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))
        if (expMatch) return true

        return (armsByExperiment.get(experiment.id) || []).some((arm) => [
          arm.arm_label,
          arm.ingredient_name_original,
          arm.ingredient_name_normalized,
          arm.treatment_type,
          arm.application_method,
        ].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle)))
      })
    })
  }, [query, studies, experimentsByStudy, armsByExperiment])

  const toggleStudy = (id: number) => {
    setExpandedStudies((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleExperiment = (id: number) => {
    setExpandedExperiments((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalTreatments = arms.length
  const totalObservations = observations.length

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center px-6 py-16">
        <div className="flex items-center gap-3 rounded-2xl border border-[#eadde1] bg-white px-5 py-4 text-sm text-[#6f6268] shadow-sm">
          <RefreshCw size={16} className="animate-spin text-[#8B1730]" />
          Building your research structure…
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_85%_8%,rgba(148,35,65,.055),transparent_29%),linear-gradient(180deg,#fffafa_0%,#fffdfd_54%,#fff_100%)] px-5 py-6 lg:px-7 lg:py-7">
      <div className="mx-auto max-w-[1500px]">
        <header className="relative overflow-hidden rounded-[26px] border border-[#eadde1] bg-white px-6 py-6 shadow-[0_22px_55px_-42px_rgba(88,20,40,.45)] lg:px-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full border border-[#8B1730]/[.06]" />
          <div className="pointer-events-none absolute -right-4 -top-4 h-44 w-44 rounded-full border border-[#8B1730]/[.05]" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[.16em] text-[#9f2945]">
                <GitBranch size={13} /> Canonical scientific structure
              </div>
              <h1 className="mt-2 font-display text-[34px] font-semibold leading-tight text-[#251d20] lg:text-[39px]">Research Structure</h1>
              <p className="mt-2 max-w-[720px] text-[12px] leading-relaxed text-[#776970]">
                See each paper as one connected scientific hierarchy — from study metadata to experimental conditions, treatment groups and the measurements they produced.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/projects/${projectId}/dataset`}
                className="inline-flex items-center gap-2 rounded-[12px] border border-[#e5cfd5] bg-[#fff8fa] px-4 py-2.5 text-[11px] font-semibold text-[#7A1B2E] transition hover:-translate-y-px hover:border-[#cda5b0] hover:bg-white"
              >
                <Database size={14} /> Open database <ArrowRight size={12} />
              </Link>
              <button
                onClick={() => load(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-[12px] bg-[#7A1B2E] px-4 py-2.5 text-[11px] font-semibold text-white shadow-[0_14px_30px_-18px_rgba(122,27,46,.75)] transition hover:-translate-y-px hover:bg-[#651426] disabled:opacity-60"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="relative mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [BookOpen, studies.length, 'Studies', 'source papers'],
              [FlaskConical, experiments.length, 'Experiments', 'distinct conditions'],
              [TestTube2, totalTreatments, 'Treatments', 'comparison groups'],
              [Database, totalObservations, 'Observations', 'measured values'],
            ].map(([Icon, value, label, helper]) => {
              const CardIcon = Icon as typeof BookOpen
              return (
                <div key={label as string} className="rounded-[17px] border border-[#eee4e7] bg-[#fffdfd] px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f8e9ed] text-[#972642]"><CardIcon size={15} /></span>
                    <div>
                      <p className="font-display text-[24px] font-semibold leading-none text-[#2b2226]">{value as number}</p>
                      <p className="mt-1 text-[10.5px] font-semibold text-[#4d4146]">{label as string}</p>
                    </div>
                  </div>
                  <p className="mt-2 pl-12 text-[9px] text-[#998a90]">{helper as string}</p>
                </div>
              )
            })}
          </div>
        </header>

        <div className="mt-5 flex flex-col gap-3 rounded-[18px] border border-[#eee4e7] bg-white p-3 shadow-[0_16px_40px_-38px_rgba(73,20,36,.45)] md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 px-2 text-[10px] text-[#7c6e74]">
            <span className="font-semibold text-[#47393f]">Structure</span>
            <ArrowRight size={11} className="text-[#c094a0]" />
            <span>Study</span>
            <ArrowRight size={11} className="text-[#c094a0]" />
            <span>Experiment</span>
            <ArrowRight size={11} className="text-[#c094a0]" />
            <span>Treatment</span>
            <ArrowRight size={11} className="text-[#c094a0]" />
            <span>Observation</span>
          </div>
          <label className="relative block min-w-[260px] md:w-[340px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9a8990]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product, treatment, journal…"
              className="w-full rounded-[12px] border border-[#eadde1] bg-[#fffafa] py-2.5 pl-9 pr-3 text-[10.5px] text-[#3c3035] outline-none transition placeholder:text-[#aa9ca1] focus:border-[#c997a5] focus:bg-white focus:ring-2 focus:ring-[#8B1730]/[.06]"
            />
          </label>
        </div>

        {error && (
          <div className="mt-5 rounded-[18px] border border-rose-200 bg-rose-50 px-5 py-4 text-[11px] text-rose-700">
            {error}
          </div>
        )}

        {!error && studies.length === 0 && (
          <div className="mt-5 rounded-[24px] border border-dashed border-[#ddc7ce] bg-white px-7 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f8e9ed] text-[#8B1730]"><GitBranch size={22} /></div>
            <h2 className="mt-5 font-display text-[25px] font-semibold text-[#2b2226]">No research structure yet</h2>
            <p className="mx-auto mt-2 max-w-[540px] text-[11px] leading-relaxed text-[#7e7076]">
              Finish structured extraction on a paper first. The application will automatically organize the extracted results into studies, experiments, treatments and observations.
            </p>
            <Link to={`/projects/${projectId}`} className="mt-5 inline-flex items-center gap-2 rounded-[12px] bg-[#7A1B2E] px-4 py-2.5 text-[11px] font-semibold text-white">
              Return to papers <ArrowRight size={12} />
            </Link>
          </div>
        )}

        {!error && studies.length > 0 && visibleStudies.length === 0 && (
          <div className="mt-5 rounded-[20px] border border-[#eadde1] bg-white px-6 py-12 text-center text-[11px] text-[#7b6d73]">
            No study, experiment or treatment matches “{query}”.
          </div>
        )}

        <div className="mt-5 space-y-5">
          {visibleStudies.map((study) => {
            const isStudyOpen = expandedStudies.has(study.id)
            const studyExperiments = experimentsByStudy.get(study.id) || []
            const stats = studyStats.get(study.id) || { experiments: 0, treatments: 0, observations: 0 }
            const doi = compactDoi(study.doi_normalized || study.doi_original)

            return (
              <section key={study.id} className="overflow-hidden rounded-[24px] border border-[#e7d9de] bg-white shadow-[0_20px_52px_-45px_rgba(76,18,36,.5)]">
                <button onClick={() => toggleStudy(study.id)} className="group w-full px-5 py-5 text-left lg:px-6">
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(145deg,#f9e8ed,#fff7f9)] text-[#8B1730] shadow-sm"><BookOpen size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[8.5px] font-bold uppercase tracking-[.13em] text-[#a3465d]">Study {study.id}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[8.5px] font-semibold ${STATUS_STYLES[study.review_status] || STATUS_STYLES.extracted}`}>{prettyStatus(study.review_status)}</span>
                      </div>
                      <h2 className="mt-1.5 font-display text-[22px] font-semibold leading-tight text-[#2b2226] lg:text-[24px]">{study.title || `Study ${study.id}`}</h2>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9.5px] text-[#81747a]">
                        {study.authors?.length > 0 && <span>{study.authors.slice(0, 4).join(', ')}{study.authors.length > 4 ? ` +${study.authors.length - 4}` : ''}</span>}
                        {study.journal && <span>{study.journal}</span>}
                        {study.publication_year && <span>{study.publication_year}</span>}
                        {study.study_type && <span className="capitalize">{study.study_type.replace(/_/g, ' ')}</span>}
                        {doi && <span>DOI {doi}</span>}
                      </div>
                    </div>
                    <div className="hidden shrink-0 items-center gap-2 md:flex">
                      {[
                        [stats.experiments, 'experiments'],
                        [stats.treatments, 'treatments'],
                        [stats.observations, 'observations'],
                      ].map(([value, label]) => (
                        <div key={label as string} className="min-w-[86px] rounded-[12px] border border-[#eee4e7] bg-[#fffafa] px-3 py-2 text-center">
                          <p className="font-display text-[18px] font-semibold leading-none text-[#2d2428]">{value as number}</p>
                          <p className="mt-1 text-[8px] text-[#9a8b91]">{label as string}</p>
                        </div>
                      ))}
                      <span className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border border-[#eadde1] text-[#8c7780] transition group-hover:border-[#cda8b2] group-hover:text-[#7A1B2E]">
                        <ChevronDown size={14} className={`transition-transform ${isStudyOpen ? 'rotate-180' : ''}`} />
                      </span>
                    </div>
                  </div>
                </button>

                {isStudyOpen && (
                  <div className="border-t border-[#f0e7e9] bg-[linear-gradient(180deg,#fffdfd,#fffafa)] px-5 pb-5 pt-4 lg:px-6 lg:pb-6">
                    {studyExperiments.length === 0 ? (
                      <div className="rounded-[17px] border border-dashed border-[#dfccd2] bg-white px-5 py-8 text-center text-[10.5px] text-[#8a7b81]">
                        No experimental conditions are attached to this study yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {studyExperiments.map((experiment, experimentIndex) => {
                          const experimentArms = armsByExperiment.get(experiment.id) || []
                          const isExperimentOpen = expandedExperiments.has(experiment.id)
                          const experimentObservationCount = experimentArms.reduce((sum, arm) => sum + (observationCountByArm.get(arm.id) || 0), 0)
                          const measurementTypes = Array.from(observationTypesByExperiment.get(experiment.id) || []).slice(0, 5)
                          const conditions = [
                            experiment.storage_temperature_c != null ? { Icon: Thermometer, value: `${experiment.storage_temperature_c} °C` } : null,
                            experiment.storage_duration_days != null ? { Icon: Clock, value: `${experiment.storage_duration_days} days` } : null,
                            experiment.packaging_type ? { Icon: Package, value: experiment.packaging_type } : null,
                            experiment.atmosphere_type ? { Icon: Wind, value: experiment.atmosphere_type } : null,
                          ].filter(Boolean) as Array<{ Icon: typeof Thermometer; value: string }>

                          return (
                            <article key={experiment.id} className="overflow-hidden rounded-[19px] border border-[#e8dce0] bg-white">
                              <button onClick={() => toggleExperiment(experiment.id)} className="group w-full p-4 text-left lg:p-5">
                                <div className="flex items-start gap-3.5">
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#f5e9ed] text-[#9b2945]"><FlaskConical size={15} /></span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-[8px] font-bold uppercase tracking-[.12em] text-[#a75a6e]">Experiment {experiment.experiment_label || experimentIndex + 1}</span>
                                      {experiment.food_category && <span className="rounded-full bg-[#f8f2f4] px-2 py-0.5 text-[8px] font-medium capitalize text-[#7f6871]">{experiment.food_category}</span>}
                                    </div>
                                    <h3 className="mt-1 font-display text-[18px] font-semibold text-[#30262a]">{productName(experiment)}</h3>
                                    {conditions.length > 0 && (
                                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                                        {conditions.map(({ Icon, value }) => (
                                          <span key={`${Icon.displayName || Icon.name}-${value}`} className="inline-flex items-center gap-1.5 rounded-full border border-[#eadfe2] bg-[#fffafb] px-2.5 py-1 text-[8.5px] text-[#786a70]">
                                            <Icon size={10} className="text-[#a5425a]" /> {value}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <div className="hidden rounded-[11px] bg-[#f9f4f6] px-3 py-2 text-right sm:block">
                                      <p className="text-[9.5px] font-semibold text-[#57484e]">{experimentArms.length} treatments</p>
                                      <p className="mt-0.5 text-[8px] text-[#9b8d92]">{experimentObservationCount} observations</p>
                                    </div>
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#eadde1] text-[#8a757e] transition group-hover:text-[#7A1B2E]">
                                      <ChevronDown size={13} className={`transition-transform ${isExperimentOpen ? 'rotate-180' : ''}`} />
                                    </span>
                                  </div>
                                </div>
                              </button>

                              {isExperimentOpen && (
                                <div className="border-t border-[#f1e9eb] bg-[#fffafa] p-4 lg:p-5">
                                  {measurementTypes.length > 0 && (
                                    <div className="mb-4 flex flex-wrap items-center gap-2">
                                      <span className="text-[8px] font-bold uppercase tracking-[.1em] text-[#9e8a92]">Measured</span>
                                      {measurementTypes.map((type) => <span key={type} className="rounded-full border border-[#eadde1] bg-white px-2.5 py-1 text-[8.5px] text-[#76676d]">{type.replace(/_/g, ' ')}</span>)}
                                    </div>
                                  )}

                                  {experimentArms.length === 0 ? (
                                    <div className="rounded-[14px] border border-dashed border-[#ddcbd0] bg-white px-4 py-6 text-center text-[10px] text-[#8f8086]">No treatment groups are attached to this experiment.</div>
                                  ) : (
                                    <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                                      {experimentArms.map((arm) => {
                                        const concentration = arm.concentration_value_normalized ?? arm.concentration_value_original
                                        const concentrationUnit = arm.concentration_unit_normalized ?? arm.concentration_unit_original
                                        const obsCount = observationCountByArm.get(arm.id) || 0
                                        return (
                                          <div key={arm.id} className={`relative rounded-[16px] border p-3.5 ${arm.is_control ? 'border-emerald-200 bg-emerald-50/45' : 'border-[#e9dde1] bg-white'}`}>
                                            <div className="flex items-start justify-between gap-3">
                                              <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                  <span className={`rounded-full px-2 py-0.5 text-[7.5px] font-bold uppercase tracking-[.08em] ${arm.is_control ? 'bg-emerald-100 text-emerald-700' : 'bg-[#f7e7eb] text-[#972b46]'}`}>{arm.is_control ? 'Control' : 'Treatment'}</span>
                                                  {arm.treatment_type && <span className="text-[7.5px] capitalize text-[#9a8a90]">{arm.treatment_type.replace(/_/g, ' ')}</span>}
                                                </div>
                                                <h4 className="mt-2 text-[11.5px] font-semibold leading-snug text-[#3a2f34]">{treatmentName(arm)}</h4>
                                              </div>
                                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#9c4057] shadow-sm"><TestTube2 size={12} /></span>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-1.5 text-[8.5px] text-[#786a70]">
                                              {concentration != null && <span className="rounded-full border border-[#eadfe2] bg-white/80 px-2 py-1">{concentration}{concentrationUnit ? ` ${concentrationUnit}` : ''}</span>}
                                              {arm.application_method && <span className="rounded-full border border-[#eadfe2] bg-white/80 px-2 py-1">{arm.application_method}</span>}
                                              {arm.treatment_timing && <span className="rounded-full border border-[#eadfe2] bg-white/80 px-2 py-1">{arm.treatment_timing.replace(/-/g, ' ')}</span>}
                                            </div>
                                            <div className="mt-3 flex items-center justify-between border-t border-black/[.05] pt-2.5">
                                              <span className="inline-flex items-center gap-1.5 text-[8.5px] font-medium text-[#76666d]"><Database size={10} /> {obsCount} observations</span>
                                              <span className={`rounded-full border px-1.5 py-0.5 text-[7.5px] ${STATUS_STYLES[arm.review_status] || STATUS_STYLES.extracted}`}>{prettyStatus(arm.review_status)}</span>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        {studies.length > 0 && (
          <div className="mt-5 flex flex-col gap-3 rounded-[20px] border border-[#e7d9de] bg-[linear-gradient(120deg,#79152c,#9e2948)] px-5 py-5 text-white shadow-[0_20px_50px_-34px_rgba(91,18,42,.72)] sm:flex-row sm:items-center sm:justify-between lg:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/12"><ShieldCheck size={16} /></span>
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[.14em] text-white/65">One connected dataset</p>
                <p className="mt-1 font-display text-[18px] font-semibold">Review the measurements when you are ready.</p>
              </div>
            </div>
            <Link to={`/projects/${projectId}/validation`} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[12px] bg-white px-4 py-2.5 text-[10px] font-semibold text-[#7A1B2E] transition hover:-translate-y-px">
              Review extracted data <ArrowRight size={11} />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

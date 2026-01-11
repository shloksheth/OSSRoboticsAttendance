import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, UserPlus, ClipboardList, QrCode, Trash2, Calendar, Filter, Settings, Loader2, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval, getDay } from 'date-fns';
import QRCodeDisplay from '../components/QRCodeDisplay';

const TEAMS = ["Fractal Fusion", "A Byte Irrational", "N.U.T.S", "Rubber Bandits", "Short Circuit", "Loose Screws", "Cattlebots", "Clockwork Mania"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [newStudent, setNewStudent] = useState({ name: '', school_id: '' });
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterTeam, setFilterTeam] = useState('all');
  const [showQR, setShowQR] = useState(false);
  const [selectedTeamForConfig, setSelectedTeamForConfig] = useState('');
  const [teamMeetingDays, setTeamMeetingDays] = useState([]);
  const [additionalDates, setAdditionalDates] = useState([]);
  const [newAdditionalDate, setNewAdditionalDate] = useState('');
  const [isConfiguringTeam, setIsConfiguringTeam] = useState(false);
  const [selectedTeamView, setSelectedTeamView] = useState(TEAMS[0]);

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ['students'],
    queryFn: () => base44.entities.Student.list()
  });

  const { data: attendance = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ['attendance'],
    queryFn: () => base44.entities.Attendance.list('-date')
  });

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const addStudentMutation = useMutation({
    mutationFn: (data) => base44.entities.Student.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setNewStudent({ name: '', school_id: '' });
      setIsAddingStudent(false);
    }
  });

  const deleteStudentMutation = useMutation({
    mutationFn: (id) => base44.entities.Student.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['students'] })
  });

  const deleteAttendanceMutation = useMutation({
    mutationFn: (id) => base44.entities.Attendance.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendance'] })
  });

  const saveTeamConfigMutation = useMutation({
    mutationFn: async ({ teamName, meetingDays, additionalMeetingDates }) => {
      const existingTeam = teams.find(t => t.name === teamName);
      if (existingTeam) {
        return base44.entities.Team.update(existingTeam.id, { 
          meeting_days: meetingDays,
          additional_meeting_dates: additionalMeetingDates
        });
      } else {
        return base44.entities.Team.create({ 
          name: teamName, 
          meeting_days: meetingDays,
          additional_meeting_dates: additionalMeetingDates
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setIsConfiguringTeam(false);
      setSelectedTeamForConfig('');
      setTeamMeetingDays([]);
      setAdditionalDates([]);
      setNewAdditionalDate('');
    }
  });

  const handleAddStudent = (e) => {
    e.preventDefault();
    if (newStudent.school_id.length !== 10) {
      alert('School ID must be exactly 10 digits');
      return;
    }
    addStudentMutation.mutate(newStudent);
  };

  const handleConfigureTeam = (teamName) => {
    setSelectedTeamForConfig(teamName);
    const existingTeam = teams.find(t => t.name === teamName);
    setTeamMeetingDays(existingTeam?.meeting_days || []);
    setAdditionalDates(existingTeam?.additional_meeting_dates || []);
    setIsConfiguringTeam(true);
  };

  const toggleMeetingDay = (day) => {
    setTeamMeetingDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSaveTeamConfig = (e) => {
    e.preventDefault();
    saveTeamConfigMutation.mutate({
      teamName: selectedTeamForConfig,
      meetingDays: teamMeetingDays,
      additionalMeetingDates: additionalDates
    });
  };

  const handleAddAdditionalDate = () => {
    if (newAdditionalDate && !additionalDates.includes(newAdditionalDate)) {
      setAdditionalDates([...additionalDates, newAdditionalDate]);
      setNewAdditionalDate('');
    }
  };

  const handleRemoveAdditionalDate = (date) => {
    setAdditionalDates(additionalDates.filter(d => d !== date));
  };

  // Calculate attendance percentage for a student on a team
  const calculateAttendancePercentage = (studentName, teamName) => {
    const teamConfig = teams.find(t => t.name === teamName);
    if (!teamConfig || !teamConfig.meeting_days || teamConfig.meeting_days.length === 0) {
      return null; // Can't calculate without team config
    }

    // Get all attendance records for this student on this team
    const studentAttendance = attendance.filter(a => 
      a.student_name === studentName && a.team === teamName
    );

    if (studentAttendance.length === 0) return 0;

    // Calculate expected meetings based on team schedule
    // Get date range from first attendance to today
    const dates = studentAttendance.map(a => new Date(a.date));
    const firstDate = new Date(Math.min(...dates));
    const today = new Date();
    
    // Count expected meetings (days that match team schedule)
    let expectedMeetings = 0;
    const dayNameToNumber = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    
    const teamDayNumbers = teamConfig.meeting_days.map(day => dayNameToNumber[day]);
    
    for (let d = new Date(firstDate); d <= today; d.setDate(d.getDate() + 1)) {
      if (teamDayNumbers.includes(d.getDay())) {
        expectedMeetings++;
      }
    }

    // Add additional meeting dates within the range
    if (teamConfig.additional_meeting_dates) {
      teamConfig.additional_meeting_dates.forEach(dateStr => {
        const additionalDate = new Date(dateStr);
        if (additionalDate >= firstDate && additionalDate <= today) {
          // Only count if it's not already a regular meeting day
          if (!teamDayNumbers.includes(additionalDate.getDay())) {
            expectedMeetings++;
          }
        }
      });
    }

    if (expectedMeetings === 0) return 0;

    const percentage = (studentAttendance.length / expectedMeetings) * 100;
    return Math.min(100, Math.round(percentage));
  };

  // Get students by team with their attendance stats
  const getTeamStudentStats = (teamName) => {
    const teamAttendance = attendance.filter(a => a.team === teamName);
    const studentNames = [...new Set(teamAttendance.map(a => a.student_name))];
    
    return studentNames.map(name => {
      const student = students.find(s => s.name === name);
      const attendanceCount = teamAttendance.filter(a => a.student_name === name).length;
      const percentage = calculateAttendancePercentage(name, teamName);
      
      return {
        name,
        school_id: student?.school_id || 'N/A',
        attendanceCount,
        percentage
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  };

  const filteredAttendance = attendance.filter(a => {
    const dateMatch = !filterDate || a.date === filterDate;
    const teamMatch = filterTeam === 'all' || a.team === filterTeam;
    return dateMatch && teamMatch;
  });

  const todayCount = attendance.filter(a => a.date === new Date().toISOString().split('T')[0]).length;

  const teamColors = {
    "Fractal Fusion": "bg-blue-500/20 text-blue-300 border-blue-500/30",
    "A Byte Irrational": "bg-green-500/20 text-green-300 border-green-500/30",
    "N.U.T.S": "bg-rose-500/20 text-rose-300 border-rose-500/30",
    "Rubber Bandits": "bg-orange-500/20 text-orange-300 border-orange-500/30",
    "Short Circuit": "bg-pink-500/20 text-pink-300 border-pink-500/30",
    "Loose Screws": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    "Cattlebots": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    "Clockwork Mania": "bg-red-500/20 text-red-300 border-red-500/30"
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900 p-4 md:p-8">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-red-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              Clockwork Mania 4013
            </h1>
            <p className="text-red-200">Attendance Management Dashboard</p>
          </div>
          <Button
            onClick={() => setShowQR(true)}
            className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white shadow-lg shadow-red-500/30"
          >
            <QrCode className="w-4 h-4 mr-2" />
            Show QR Code
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-white/10 backdrop-blur-xl border-white/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-200 text-sm">Total Students</p>
                    <p className="text-3xl font-bold text-white mt-1">{students.length}</p>
                  </div>
                  <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                    <Users className="w-6 h-6 text-red-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-white/10 backdrop-blur-xl border-white/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-200 text-sm">Today's Attendance</p>
                    <p className="text-3xl font-bold text-white mt-1">{todayCount}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                    <ClipboardList className="w-6 h-6 text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="bg-white/10 backdrop-blur-xl border-white/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-200 text-sm">Total Records</p>
                    <p className="text-3xl font-bold text-white mt-1">{attendance.length}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <Tabs defaultValue="teams" className="space-y-6">
          <TabsList className="bg-white/10 border border-white/20">
            <TabsTrigger value="teams" className="data-[state=active]:bg-red-500 data-[state=active]:text-white text-red-200">
              Team Attendance
            </TabsTrigger>
            <TabsTrigger value="attendance" className="data-[state=active]:bg-red-500 data-[state=active]:text-white text-red-200">
              All Records
            </TabsTrigger>
            <TabsTrigger value="students" className="data-[state=active]:bg-red-500 data-[state=active]:text-white text-red-200">
              Manage Students
            </TabsTrigger>
          </TabsList>

          <TabsContent value="teams">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <Card className="bg-white/10 backdrop-blur-xl border-white/20">
                <CardHeader className="border-b border-white/10">
                  <CardTitle className="text-white text-lg">Teams</CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <div className="space-y-1">
                    {TEAMS.map(team => {
                      const teamConfig = teams.find(t => t.name === team);
                      const isConfigured = teamConfig && teamConfig.meeting_days?.length > 0;
                      
                      return (
                        <div key={team} className="flex items-center justify-between">
                          <button
                            onClick={() => setSelectedTeamView(team)}
                            className={`flex-1 text-left px-3 py-2 rounded-lg transition-all ${
                              selectedTeamView === team
                                ? 'bg-red-500 text-white'
                                : 'text-red-200 hover:bg-white/5'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{team}</span>
                              {!isConfigured && (
                                <Badge variant="outline" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-xs">
                                  Setup
                                </Badge>
                              )}
                            </div>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleConfigureTeam(team)}
                            className="ml-1 text-red-300 hover:text-white hover:bg-white/10"
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-3 bg-white/10 backdrop-blur-xl border-white/20">
                <CardHeader className="border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white text-xl">{selectedTeamView}</CardTitle>
                      {teams.find(t => t.name === selectedTeamView)?.meeting_days?.length > 0 && (
                        <p className="text-sm text-red-200 mt-1">
                          Meets: {teams.find(t => t.name === selectedTeamView).meeting_days.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10 hover:bg-transparent">
                          <TableHead className="text-red-200">Student Name</TableHead>
                          <TableHead className="text-red-200">School ID</TableHead>
                          <TableHead className="text-red-200">Check-Ins</TableHead>
                          <TableHead className="text-red-200">Attendance %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const stats = getTeamStudentStats(selectedTeamView);
                          if (stats.length === 0) {
                            return (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-red-300">
                                  No attendance records for this team yet
                                </TableCell>
                              </TableRow>
                            );
                          }
                          return stats.map((stat) => (
                            <TableRow key={stat.name} className="border-white/10 hover:bg-white/5">
                              <TableCell className="text-white font-medium">{stat.name}</TableCell>
                              <TableCell className="text-red-200 font-mono">{stat.school_id}</TableCell>
                              <TableCell className="text-red-200">{stat.attendanceCount}</TableCell>
                              <TableCell>
                                {stat.percentage !== null ? (
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 max-w-[100px] bg-white/10 rounded-full h-2">
                                      <div
                                        className={`h-2 rounded-full ${
                                          stat.percentage >= 80 ? 'bg-green-500' :
                                          stat.percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                                        }`}
                                        style={{ width: `${stat.percentage}%` }}
                                      />
                                    </div>
                                    <span className="text-white font-semibold text-sm w-12">{stat.percentage}%</span>
                                  </div>
                                ) : (
                                  <span className="text-red-300 text-sm">Configure team days</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="attendance">
            <Card className="bg-white/10 backdrop-blur-xl border-white/20">
              <CardHeader className="border-b border-white/10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle className="text-white">Attendance Records</CardTitle>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-red-300" />
                      <Input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="bg-white/10 border-white/20 text-white h-9 w-40"
                      />
                    </div>
                    <Select value={filterTeam} onValueChange={setFilterTeam}>
                      <SelectTrigger className="bg-white/10 border-white/20 text-white h-9 w-40">
                        <SelectValue placeholder="All Teams" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-white/20">
                        <SelectItem value="all" className="text-white hover:bg-red-500/30">All Teams</SelectItem>
                        {TEAMS.map(t => (
                          <SelectItem key={t} value={t} className="text-white hover:bg-red-500/30">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-red-200">Student Name</TableHead>
                        <TableHead className="text-red-200">School ID</TableHead>
                        <TableHead className="text-red-200">Team</TableHead>
                        <TableHead className="text-red-200">Time</TableHead>
                        <TableHead className="text-red-200">Date</TableHead>
                        <TableHead className="text-red-200 w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendanceLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-red-400 mx-auto" />
                          </TableCell>
                        </TableRow>
                      ) : filteredAttendance.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-red-300">
                            No attendance records found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredAttendance.map((record) => (
                          <TableRow key={record.id} className="border-white/10 hover:bg-white/5">
                            <TableCell className="text-white font-medium">{record.student_name}</TableCell>
                            <TableCell className="text-red-200">{record.school_id}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={teamColors[record.team]}>
                                {record.team}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-red-200">{record.check_in_time}</TableCell>
                            <TableCell className="text-red-200">
                              {format(new Date(record.date), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteAttendanceMutation.mutate(record.id)}
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="students">
            <Card className="bg-white/10 backdrop-blur-xl border-white/20">
              <CardHeader className="border-b border-white/10">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">Student Roster</CardTitle>
                  <Dialog open={isAddingStudent} onOpenChange={setIsAddingStudent}>
                    <DialogTrigger asChild>
                      <Button className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600">
                        <UserPlus className="w-4 h-4 mr-2" />
                        Add Student
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border-white/20">
                      <DialogHeader>
                        <DialogTitle className="text-white">Add New Student</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleAddStudent} className="space-y-4 mt-4">
                        <div>
                          <Label className="text-red-100">Student Name</Label>
                          <Input
                            value={newStudent.name}
                            onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                            placeholder="Enter full name"
                            className="bg-white/10 border-white/20 text-white mt-1"
                            required
                          />
                        </div>
                        <div>
                          <Label className="text-red-100">School ID (10 digits)</Label>
                          <Input
                            value={newStudent.school_id}
                            onChange={(e) => setNewStudent({ ...newStudent, school_id: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                            placeholder="Enter 10-digit ID"
                            className="bg-white/10 border-white/20 text-white mt-1"
                            required
                            maxLength={10}
                          />
                          <p className="text-xs text-red-300 mt-1">{newStudent.school_id.length}/10 digits</p>
                        </div>
                        <Button 
                          type="submit" 
                          className="w-full bg-gradient-to-r from-red-500 to-orange-500"
                          disabled={addStudentMutation.isPending}
                        >
                          {addStudentMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Add Student'
                          )}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-red-200">Student Name</TableHead>
                        <TableHead className="text-red-200">School ID</TableHead>
                        <TableHead className="text-red-200 w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentsLoading ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-red-400 mx-auto" />
                          </TableCell>
                        </TableRow>
                      ) : students.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-red-300">
                            No students added yet
                          </TableCell>
                        </TableRow>
                      ) : (
                        students.map((student) => (
                          <TableRow key={student.id} className="border-white/10 hover:bg-white/5">
                            <TableCell className="text-white font-medium">{student.name}</TableCell>
                            <TableCell className="text-red-200 font-mono">{student.school_id}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteStudentMutation.mutate(student.id)}
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="bg-slate-900 border-white/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-center">Scan to Check In</DialogTitle>
          </DialogHeader>
          <QRCodeDisplay />
        </DialogContent>
      </Dialog>

      <Dialog open={isConfiguringTeam} onOpenChange={setIsConfiguringTeam}>
        <DialogContent className="bg-slate-900 border-white/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Configure {selectedTeamForConfig}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveTeamConfig} className="space-y-4 mt-4">
            <div>
              <Label className="text-red-100 mb-3 block">Regular Meeting Days</Label>
              <div className="space-y-2">
                {DAYS.map(day => (
                  <div key={day} className="flex items-center space-x-2">
                    <Checkbox
                      id={day}
                      checked={teamMeetingDays.includes(day)}
                      onCheckedChange={() => toggleMeetingDay(day)}
                      className="border-white/20"
                    />
                    <label
                      htmlFor={day}
                      className="text-sm text-white cursor-pointer"
                    >
                      {day}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-red-100 mb-2 block">Additional Meeting Dates</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  type="date"
                  value={newAdditionalDate}
                  onChange={(e) => setNewAdditionalDate(e.target.value)}
                  className="bg-white/10 border-white/20 text-white"
                />
                <Button
                  type="button"
                  onClick={handleAddAdditionalDate}
                  variant="outline"
                  className="bg-white/5 border-white/20 text-white hover:bg-white/10"
                >
                  Add
                </Button>
              </div>
              {additionalDates.length > 0 && (
                <div className="space-y-1">
                  {additionalDates.sort().map(date => (
                    <div key={date} className="flex items-center justify-between bg-white/5 rounded px-3 py-2">
                      <span className="text-sm text-white">{format(new Date(date), 'MMM d, yyyy')}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveAdditionalDate(date)}
                        className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-red-500 to-orange-500"
              disabled={saveTeamConfigMutation.isPending || teamMeetingDays.length === 0}
            >
              {saveTeamConfigMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Save Configuration'
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
// Mock data service for OnGoPool application
import { 
  User, Ride, ChatMessage, Stop, RideStatus, UserType, 
  RideRequest, RideRequestStatus, PaymentStatus, PaymentMethod, 
  PaymentHistory, AvailableRide, DriverType, VehicleType, SeatSelection 
} from '../types';

// Mock user data storage
const STORAGE_KEYS = {
  CURRENT_USER: 'ongopool_current_user',
  USERS: 'ongopool_users',
  RIDES: 'ongopool_rides',
  CHATS: 'ongopool_chats',
  RIDE_REQUESTS: 'ongopool_ride_requests',
  PAYMENT_METHODS: 'ongopool_payment_methods',
  PAYMENT_HISTORY: 'ongopool_payment_history',
};

// Initialize localStorage with mock data if empty
export const initializeMockData = () => {
  if (!localStorage.getItem(STORAGE_KEYS.RIDES)) {
    localStorage.setItem(STORAGE_KEYS.RIDES, JSON.stringify(mockRides));
  }
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(mockUsers));
  }
  if (!localStorage.getItem(STORAGE_KEYS.CHATS)) {
    localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(mockChats));
  }
};

// Mock users
export const mockUsers: User[] = [
  {
    id: '1',
    name: 'John Driver',
    email: 'john@driver.com',
    phone: '+1-555-0123',
    dateOfBirth: '1990-05-15',
    address: '123 Main St',
    city: 'Toronto',
    state: 'ON',
    zipCode: 'M5H 2N2',
    profilePicture: '/assets/placeholder-avatar.jpg',
    userType: 'driver' as UserType,
    licenseNumber: 'D1234567',
    licenseExpiry: '2025-12-31',
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry',
    vehicleYear: 2020,
    vehicleColor: 'Silver',
    vehiclePlate: 'ABC 123',
    rating: 4.8,
    totalRides: 245,
    earnings: 3240.50,
  },
  {
    id: '2',
    name: 'Sarah Rider',
    email: 'sarah@rider.com',
    phone: '+1-555-0124',
    dateOfBirth: '1995-08-22',
    address: '456 Oak Ave',
    city: 'Toronto',
    state: 'ON',
    zipCode: 'M4C 1B5',
    profilePicture: '/assets/placeholder-avatar-2.jpg',
    userType: 'rider' as UserType,
    rating: 4.9,
    totalRides: 67,
  },
];

// Mock ride stops
export const mockStops: Stop[] = [
  {
    id: 's1',
    address: '123 Main St, Toronto, ON',
    city: 'Toronto',
    state: 'ON',
    zipCode: 'M5H 2N2',
    latitude: 43.6532,
    longitude: -79.3832,
    estimatedArrival: '10:00 AM',
    actualArrival: null,
    order: 0,
  },
  {
    id: 's2',
    address: '789 Queen St W, Toronto, ON',
    city: 'Toronto',
    state: 'ON',
    zipCode: 'M6J 1G1',
    latitude: 43.6476,
    longitude: -79.4134,
    estimatedArrival: '10:25 AM',
    actualArrival: null,
    order: 1,
  },
  {
    id: 's3',
    address: '456 Bloor St E, Toronto, ON',
    city: 'Toronto',
    state: 'ON',
    zipCode: 'M4W 1A1',
    latitude: 43.6708,
    longitude: -79.3799,
    estimatedArrival: '10:45 AM',
    actualArrival: null,
    order: 2,
  },
];

// Mock rides with different statuses
export const mockRides: Ride[] = [
  {
    id: 'r1',
    driverId: '1',
    driverName: 'John Driver',
    driverPhoto: '/assets/placeholder-avatar.jpg',
    driverRating: 4.8,
    stops: mockStops,
    departureDate: '2025-11-16',
    departureTime: '10:00',
    period: 'AM',
    pricePerSeat: 25,
    totalSeats: 3,
    availableSeats: 2,
    features: ['No Smoking', 'Music', 'Winter Tires'],
    status: 'pending' as RideStatus,
    riders: [
      {
        id: '2',
        name: 'Sarah Rider',
        photo: '/assets/placeholder-avatar-2.jpg',
        seatsBooked: 1,
        pickupStopId: 's1',
        dropoffStopId: 's3',
      },
    ],
    createdAt: '2025-11-15T10:00:00Z',
  },
  {
    id: 'r2',
    driverId: '1',
    driverName: 'John Driver',
    driverPhoto: '/assets/placeholder-avatar.jpg',
    driverRating: 4.8,
    stops: [
      {
        id: 's4',
        address: '200 Bay St, Toronto, ON',
        city: 'Toronto',
        state: 'ON',
        zipCode: 'M5J 2J1',
        latitude: 43.6481,
        longitude: -79.3809,
        estimatedArrival: '2:00 PM',
        actualArrival: '2:05 PM',
        order: 0,
      },
      {
        id: 's5',
        address: '100 King St W, Toronto, ON',
        city: 'Toronto',
        state: 'ON',
        zipCode: 'M5X 1C7',
        latitude: 43.6481,
        longitude: -79.3832,
        estimatedArrival: '2:20 PM',
        actualArrival: null,
        order: 1,
      },
    ],
    departureDate: '2025-11-15',
    departureTime: '2:00',
    period: 'PM',
    pricePerSeat: 20,
    totalSeats: 3,
    availableSeats: 0,
    features: ['Coffee', 'No Smoking'],
    status: 'active' as RideStatus,
    riders: [
      {
        id: '3',
        name: 'Mike Johnson',
        photo: '/assets/placeholder-avatar-3.jpg',
        seatsBooked: 2,
        pickupStopId: 's4',
        dropoffStopId: 's5',
      },
    ],
    createdAt: '2025-11-14T08:00:00Z',
  },
  {
    id: 'r3',
    driverId: '1',
    driverName: 'John Driver',
    driverPhoto: '/assets/placeholder-avatar.jpg',
    driverRating: 4.8,
    stops: [
      {
        id: 's6',
        address: '50 University Ave, Toronto, ON',
        city: 'Toronto',
        state: 'ON',
        zipCode: 'M5J 2H7',
        latitude: 43.6532,
        longitude: -79.3849,
        estimatedArrival: '9:00 AM',
        actualArrival: '9:00 AM',
        order: 0,
      },
    ],
    departureDate: '2025-11-14',
    departureTime: '9:00',
    period: 'AM',
    pricePerSeat: 15,
    totalSeats: 2,
    availableSeats: 0,
    features: ['Music'],
    status: 'completed' as RideStatus,
    riders: [
      {
        id: '4',
        name: 'Emma Wilson',
        photo: '/assets/placeholder-avatar-4.jpg',
        seatsBooked: 1,
        pickupStopId: 's6',
        dropoffStopId: 's6',
      },
    ],
    createdAt: '2025-11-13T06:00:00Z',
    completedAt: '2025-11-14T10:00:00Z',
  },
  {
    id: 'r4',
    driverId: '1',
    driverName: 'John Driver',
    driverPhoto: '/assets/placeholder-avatar.jpg',
    driverRating: 4.8,
    stops: mockStops,
    departureDate: '2025-11-20',
    departureTime: '3:00',
    period: 'PM',
    pricePerSeat: 30,
    totalSeats: 4,
    availableSeats: 4,
    features: ['Coffee', 'No Smoking', 'Winter Tires', 'Music'],
    status: 'upcoming' as RideStatus,
    riders: [],
    createdAt: '2025-11-15T11:00:00Z',
  },
  {
    id: 'r5',
    driverId: '1',
    driverName: 'John Driver',
    driverPhoto: '/assets/placeholder-avatar.jpg',
    driverRating: 4.8,
    stops: [mockStops[0], mockStops[2]],
    departureDate: '2025-11-18',
    departureTime: '11:00',
    period: 'AM',
    pricePerSeat: 22,
    totalSeats: 3,
    availableSeats: 3,
    features: ['No Smoking'],
    status: 'canceled' as RideStatus,
    riders: [],
    createdAt: '2025-11-14T09:00:00Z',
    canceledAt: '2025-11-15T08:00:00Z',
    cancelReason: 'Vehicle maintenance required',
  },
];

// Mock chat messages
export const mockChats: ChatMessage[] = [
  {
    id: 'c1',
    rideId: 'r1',
    senderId: '2',
    senderName: 'Sarah Rider',
    receiverId: '1',
    receiverName: 'John Driver',
    message: 'Hi! Can you wait 2 minutes at the pickup point?',
    timestamp: '2025-11-15T09:45:00Z',
    read: false,
  },
  {
    id: 'c2',
    rideId: 'r1',
    senderId: '1',
    senderName: 'John Driver',
    receiverId: '2',
    receiverName: 'Sarah Rider',
    message: 'Sure, no problem!',
    timestamp: '2025-11-15T09:46:00Z',
    read: true,
  },
  {
    id: 'c3',
    rideId: 'r2',
    senderId: '3',
    senderName: 'Mike Johnson',
    receiverId: '1',
    receiverName: 'John Driver',
    message: "I'm at the pickup location",
    timestamp: '2025-11-15T13:58:00Z',
    read: true,
  },
];

// Service functions
export const getCurrentUser = (): User | null => {
  const userJson = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  return userJson ? JSON.parse(userJson) : null;
};

export const setCurrentUser = (user: User | null) => {
  if (user) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  }
};

export const registerUser = (user: User): boolean => {
  const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
  
  // Check if email already exists
  if (users.some((u: User) => u.email === user.email)) {
    return false;
  }
  
  users.push(user);
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  setCurrentUser(user);
  return true;
};

export const loginUser = (email: string, password: string): User | null => {
  const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
  const user = users.find((u: User) => u.email === email);
  
  if (user) {
    setCurrentUser(user);
    return user;
  }
  return null;
};

export const logoutUser = () => {
  setCurrentUser(null);
};

export const getUserById = (userId: string): User | null => {
  const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || JSON.stringify(mockUsers));
  return users.find((u: User) => u.id === userId) || null;
};

export const updateUser = (updatedUser: User): boolean => {
  const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || JSON.stringify(mockUsers));
  const index = users.findIndex((u: User) => u.id === updatedUser.id);
  if (index !== -1) {
    users[index] = updatedUser;
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    setCurrentUser(updatedUser);
    return true;
  }
  return false;
};

export const getRides = (): Ride[] => {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.RIDES) || '[]');
};

export const getRidesByStatus = (status: RideStatus, userId: string): Ride[] => {
  const rides = getRides();
  return rides.filter(r => r.driverId === userId && r.status === status);
};

export const getRideById = (rideId: string): Ride | null => {
  const rides = getRides();
  return rides.find(r => r.id === rideId) || null;
};

export const updateRideStatus = (rideId: string, status: RideStatus): boolean => {
  const rides = getRides();
  const rideIndex = rides.findIndex(r => r.id === rideId);
  
  if (rideIndex !== -1) {
    rides[rideIndex].status = status;
    if (status === 'completed') {
      rides[rideIndex].completedAt = new Date().toISOString();
    }
    localStorage.setItem(STORAGE_KEYS.RIDES, JSON.stringify(rides));
    return true;
  }
  return false;
};

export const createRide = (ride: Ride): boolean => {
  const rides = getRides();
  rides.push(ride);
  localStorage.setItem(STORAGE_KEYS.RIDES, JSON.stringify(rides));
  return true;
};

export const updateRide = (rideId: string, updates: Partial<Ride>): boolean => {
  const rides = getRides();
  const rideIndex = rides.findIndex(r => r.id === rideId);
  
  if (rideIndex !== -1) {
    rides[rideIndex] = { ...rides[rideIndex], ...updates };
    localStorage.setItem(STORAGE_KEYS.RIDES, JSON.stringify(rides));
    return true;
  }
  return false;
};

export const deleteRide = (rideId: string): boolean => {
  const rides = getRides();
  const filteredRides = rides.filter(r => r.id !== rideId);
  localStorage.setItem(STORAGE_KEYS.RIDES, JSON.stringify(filteredRides));
  return true;
};

export const getChats = (userId: string): ChatMessage[] => {
  const chats = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHATS) || '[]');
  return chats.filter((c: ChatMessage) => 
    c.senderId === userId || c.receiverId === userId
  );
};

export const sendChatMessage = (message: ChatMessage): boolean => {
  const chats = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHATS) || '[]');
  chats.push(message);
  localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(chats));
  return true;
};

// ============ RIDER FUNCTIONALITY ============

// Mock rider user
export const mockRider: User = {
  id: '2',
  name: 'Sarah Rider',
  email: 'sarah@rider.com',
  phone: '+1-555-0124',
  dateOfBirth: '1995-08-22',
  address: '456 Oak Ave',
  city: 'Toronto',
  state: 'ON',
  zipCode: 'M4C 1B5',
  profilePicture: '/assets/placeholder-avatar-2.jpg',
  userType: 'rider' as UserType,
  rating: 4.9,
  totalRides: 67,
};

// Mock ride requests for riders
export const mockRideRequests: RideRequest[] = [
  {
    id: 'rr1',
    riderId: '2',
    rideId: 'r1',
    driverId: '1',
    driverName: 'John Driver',
    driverPhoto: '/assets/placeholder-avatar.jpg',
    vehicleType: 'sedan',
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry 2020',
    pickupStop: mockStops[0],
    dropoffStop: mockStops[2],
    seatsBooked: 1,
    totalPrice: 25,
    status: 'confirmed',
    paymentStatus: 'paid',
    requestedAt: '2025-11-15T09:00:00Z',
    confirmedAt: '2025-11-15T09:10:00Z',
  },
  {
    id: 'rr2',
    riderId: '2',
    rideId: 'r5',
    driverId: '3',
    driverName: 'Alex OnGo',
    driverPhoto: '/assets/placeholder-avatar-3.jpg',
    vehicleType: 'suv',
    vehicleMake: 'Honda',
    vehicleModel: 'CR-V 2021',
    pickupStop: {
      id: 's7',
      address: '300 Front St W, Toronto, ON',
      city: 'Toronto',
      state: 'ON',
      zipCode: 'M5V 0E9',
      latitude: 43.6426,
      longitude: -79.3871,
      estimatedArrival: '3:00 PM',
      actualArrival: null,
      order: 0,
    },
    dropoffStop: {
      id: 's8',
      address: '500 Yonge St, Toronto, ON',
      city: 'Toronto',
      state: 'ON',
      zipCode: 'M4Y 1Y6',
      latitude: 43.6629,
      longitude: -79.3849,
      estimatedArrival: '3:30 PM',
      actualArrival: null,
      order: 1,
    },
    seatsBooked: 2,
    totalPrice: 40,
    status: 'pending',
    paymentStatus: 'authorized',
    requestedAt: '2025-11-16T08:00:00Z',
  },
];

// Mock available rides (for search results)
// Example: Kitchener -> Woodstock -> London route
export const mockAvailableRides: AvailableRide[] = [
  {
    id: 'ar1',
    driverId: '4',
    driverName: 'Emily Carpool',
    driverPhoto: '/assets/placeholder-avatar-4.jpg',
    driverRating: 4.7,
    driverType: 'carpool',
    vehicleType: 'sedan',
    isSegmentBooking: false,
    stops: [
      {
        id: 'kitchener',
        address: '100 King St E, Kitchener, ON',
        city: 'Kitchener',
        state: 'ON',
        zipCode: 'N2G 2K8',
        latitude: 43.4516,
        longitude: -80.4925,
        estimatedArrival: '8:00 AM',
        actualArrival: null,
        order: 0,
      },
      {
        id: 'woodstock',
        address: '500 Dundas St, Woodstock, ON',
        city: 'Woodstock',
        state: 'ON',
        zipCode: 'N4S 1C4',
        latitude: 43.1315,
        longitude: -80.7467,
        estimatedArrival: '8:45 AM',
        actualArrival: null,
        order: 1,
      },
      {
        id: 'london',
        address: '300 Dufferin Ave, London, ON',
        city: 'London',
        state: 'ON',
        zipCode: 'N6A 4L9',
        latitude: 42.9849,
        longitude: -81.2453,
        estimatedArrival: '9:30 AM',
        actualArrival: null,
        order: 2,
      },
    ],
    matchedRoute: {
      from: {
        id: 'kitchener',
        address: '100 King St E, Kitchener, ON',
        city: 'Kitchener',
        state: 'ON',
        zipCode: 'N2G 2K8',
        latitude: 43.4516,
        longitude: -80.4925,
        estimatedArrival: '8:00 AM',
        actualArrival: null,
        order: 0,
      },
      to: {
        id: 'london',
        address: '300 Dufferin Ave, London, ON',
        city: 'London',
        state: 'ON',
        zipCode: 'N6A 4L9',
        latitude: 42.9849,
        longitude: -81.2453,
        estimatedArrival: '9:30 AM',
        actualArrival: null,
        order: 2,
      },
    },
    departureDate: '2025-11-17',
    departureTime: '8:00',
    period: 'AM',
    pricePerSeat: 25, // Full route price
    totalSeats: 3,
    availableSeats: 2,
    features: ['No Smoking', 'Music'],
    status: 'upcoming',
    riders: [],
    createdAt: '2025-11-15T10:00:00Z',
  },
  {
    id: 'ar2',
    driverId: '5',
    driverName: 'Michael OnGoPool',
    driverPhoto: '/assets/placeholder-avatar-5.jpg',
    driverRating: 4.9,
    driverType: 'ongopool',
    vehicleType: 'suv',
    isSegmentBooking: true,
    stops: [
      {
        id: 'guelph',
        address: '1 Carden St, Guelph, ON',
        city: 'Guelph',
        state: 'ON',
        zipCode: 'N1H 3A1',
        latitude: 43.5448,
        longitude: -80.2482,
        estimatedArrival: '10:00 AM',
        actualArrival: null,
        order: 0,
      },
      {
        id: 'woodstock2',
        address: '410 Dundas St, Woodstock, ON',
        city: 'Woodstock',
        state: 'ON',
        zipCode: 'N4S 1C4',
        latitude: 43.1315,
        longitude: -80.7467,
        estimatedArrival: '10:50 AM',
        actualArrival: null,
        order: 1,
      },
      {
        id: 'london2',
        address: '255 Queens Ave, London, ON',
        city: 'London',
        state: 'ON',
        zipCode: 'N6A 5R8',
        latitude: 42.9849,
        longitude: -81.2453,
        estimatedArrival: '11:35 AM',
        actualArrival: null,
        order: 2,
      },
    ],
    matchedRoute: {
      from: {
        id: 'guelph',
        address: '1 Carden St, Guelph, ON',
        city: 'Guelph',
        state: 'ON',
        zipCode: 'N1H 3A1',
        latitude: 43.5448,
        longitude: -80.2482,
        estimatedArrival: '10:00 AM',
        actualArrival: null,
        order: 0,
      },
      to: {
        id: 'london2',
        address: '255 Queens Ave, London, ON',
        city: 'London',
        state: 'ON',
        zipCode: 'N6A 5R8',
        latitude: 42.9849,
        longitude: -81.2453,
        estimatedArrival: '11:35 AM',
        actualArrival: null,
        order: 2,
      },
    },
    departureDate: '2025-11-17',
    departureTime: '10:00',
    period: 'AM',
    pricePerSeat: 30, // Full route price
    totalSeats: 6,
    availableSeats: 4,
    features: ['WiFi', 'USB Charging', 'No Smoking'],
    status: 'upcoming',
    riders: [],
    createdAt: '2025-11-15T11:00:00Z',
  },
];

// Mock payment methods
export const mockPaymentMethods: PaymentMethod[] = [
  {
    id: 'pm1',
    type: 'credit',
    cardNumber: '4532',
    cardHolder: 'Sarah Rider',
    expiryDate: '12/26',
    isDefault: true,
  },
  {
    id: 'pm2',
    type: 'debit',
    cardNumber: '5678',
    cardHolder: 'Sarah Rider',
    expiryDate: '08/25',
    isDefault: false,
  },
];

// Mock payment history
export const mockPaymentHistory: PaymentHistory[] = [
  {
    id: 'ph1',
    rideRequestId: 'rr1',
    amount: 25,
    paymentMethod: 'Credit •••• 4532',
    status: 'paid',
    date: '2025-11-15',
    transactionId: 'TXN-001-2025',
  },
  {
    id: 'ph2',
    rideRequestId: 'rr2',
    amount: 40,
    paymentMethod: 'Credit •••• 4532',
    status: 'authorized',
    date: '2025-11-16',
    transactionId: 'TXN-002-2025',
  },
];

// Rider API functions
export const getRideRequests = (riderId: string): RideRequest[] => {
  const requests = JSON.parse(localStorage.getItem(STORAGE_KEYS.RIDE_REQUESTS) || JSON.stringify(mockRideRequests));
  return requests.filter((r: RideRequest) => r.riderId === riderId);
};

export const getRideRequestById = (requestId: string): RideRequest | null => {
  const requests = JSON.parse(localStorage.getItem(STORAGE_KEYS.RIDE_REQUESTS) || JSON.stringify(mockRideRequests));
  return requests.find((r: RideRequest) => r.id === requestId) || null;
};

export const createRideRequest = (request: RideRequest): boolean => {
  const requests = JSON.parse(localStorage.getItem(STORAGE_KEYS.RIDE_REQUESTS) || JSON.stringify(mockRideRequests));
  requests.push(request);
  localStorage.setItem(STORAGE_KEYS.RIDE_REQUESTS, JSON.stringify(requests));
  return true;
};

export const updateRideRequestStatus = (requestId: string, status: RideRequestStatus): boolean => {
  const requests = JSON.parse(localStorage.getItem(STORAGE_KEYS.RIDE_REQUESTS) || JSON.stringify(mockRideRequests));
  const index = requests.findIndex((r: RideRequest) => r.id === requestId);
  if (index !== -1) {
    requests[index].status = status;
    localStorage.setItem(STORAGE_KEYS.RIDE_REQUESTS, JSON.stringify(requests));
    return true;
  }
  return false;
};

export const searchAvailableRides = (from: string, to: string, date?: string, passengers?: number): AvailableRide[] => {
  // Import route matching utility
  const { matchRidesToSearch } = require('../utils/routeUtils');
  
  // Use route matching to find rides that pass through from -> to
  return matchRidesToSearch(mockAvailableRides, from, to, date, passengers || 1);
};

export const getAvailableRideById = (rideId: string): AvailableRide | null => {
  return mockAvailableRides.find(r => r.id === rideId) || null;
};

export const getSeatSelection = (rideId: string, vehicleType: VehicleType): SeatSelection[] => {
  const totalSeats = vehicleType === 'sedan' ? 4 : 7;
  const seats: SeatSelection[] = [];
  
  for (let i = 1; i <= totalSeats; i++) {
    seats.push({
      seatNumber: i,
      isAvailable: i <= 3, // Mock: first 3 seats available
      riderId: i > 3 ? 'occupied' : undefined,
      riderName: i > 3 ? 'Occupied' : undefined,
    });
  }
  
  return seats;
};

export const getPaymentMethods = (): PaymentMethod[] => {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.PAYMENT_METHODS) || JSON.stringify(mockPaymentMethods));
};

export const addPaymentMethod = (method: PaymentMethod): boolean => {
  const methods = getPaymentMethods();
  methods.push(method);
  localStorage.setItem(STORAGE_KEYS.PAYMENT_METHODS, JSON.stringify(methods));
  return true;
};

export const getPaymentHistory = (): PaymentHistory[] => {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.PAYMENT_HISTORY) || JSON.stringify(mockPaymentHistory));
};

export const addPaymentHistory = (payment: PaymentHistory): boolean => {
  const history = getPaymentHistory();
  history.push(payment);
  localStorage.setItem(STORAGE_KEYS.PAYMENT_HISTORY, JSON.stringify(history));
  return true;
};
